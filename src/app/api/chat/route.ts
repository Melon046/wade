import { NextResponse, type NextRequest } from "next/server";
import type { ModelMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { resolveModelChain } from "@/lib/models";
import { WADE_SYSTEM_PROMPT } from "@/lib/prompt";
import { env, assertSupabaseEnv, EnvError } from "@/lib/env";
import { acquireTurn, releaseTurn } from "@/lib/rate-limit";
import { loadContextMessages } from "@/lib/context";
import {
  AllProvidersFailedError,
  openProviderStream,
  streamProviderReply,
  type PersistTurnInput,
} from "@/lib/provider-chain";

/**
 * Streaming chat endpoint.
 *
 * Contract
 *   POST /api/chat
 *   body: { conversationId?: string, message: string }
 *   200 : text/plain stream of the assistant's reply, chunked as it is produced
 *   400 : malformed body / empty message
 *   401 : not signed in
 *   413 : message too long
 *   429 : rate limit, concurrency limit, or daily token quota reached
 *   500 : server misconfiguration (e.g. missing Supabase env)
 *   502 : every provider in the chain failed
 *   503 : no provider configured
 *
 * Response headers
 *   X-Conversation-Id : the conversation the turn was written to (new or existing)
 *   X-Wade-Provider   : "google" | "groq" — which provider actually answered
 *   X-Wade-Model      : the model id that answered
 *
 * The API keys never leave this process. The browser only ever talks to this
 * route, which is the whole point of not calling the provider from the client.
 *
 * Error bodies are deliberately generic. Provider errors are logged server-side
 * with full detail; the client is told only that the request failed, so a
 * provider's raw message (which can echo request content or key fragments)
 * never reaches the browser.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_INPUT_CHARS = 8000;

/** Safety net: never hold a concurrency slot longer than this. */
const SLOT_SAFETY_MS = 120_000;

export async function POST(request: NextRequest) {
  // --- 0. Configuration ----------------------------------------------------
  // Validated lazily (not at module load) so `next build` works without a
  // populated .env.local, but a bad value still fails fast and clearly.
  try {
    assertSupabaseEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error("[wade] configuration error:", error.message);
      return NextResponse.json(
        { error: "The server is not configured correctly." },
        { status: 500 },
      );
    }
    throw error;
  }

  // --- 1. Authenticate -----------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // --- 2. Validate input ---------------------------------------------------
  let body: {
    conversationId?: string;
    message?: string;
    regenerate?: boolean;
    editMessageId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = body.message?.trim();
  if (!text) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `Message is too long (max ${MAX_INPUT_CHARS} characters).` },
      { status: 413 },
    );
  }

  // --- 3. Resolve the provider chain --------------------------------------
  const chain = resolveModelChain();
  if (chain.length === 0) {
    return NextResponse.json(
      {
        error:
          "No LLM provider is configured. Add GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY to .env.local and restart the dev server.",
      },
      { status: 503 },
    );
  }

  // --- 4. Rate limit (burst + concurrency) --------------------------------
  // This runs *before* the quota check and before any provider call. The daily
  // token quota is a spend ceiling checked before the turn and written after
  // it, so on its own it lets N parallel requests all pass; this is the guard
  // that actually stops a burst.
  const decision = acquireTurn(user.id);
  if (!decision.ok) {
    const retryAfter = decision.retryAfterSeconds ?? 5;
    return NextResponse.json(
      {
        error:
          decision.reason === "concurrency"
            ? "You already have the maximum number of replies in flight. Wait for one to finish."
            : "You are sending messages too quickly. Please slow down.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseTurn(user.id);
  };

  // Guarantee the slot is returned even if the stream is never consumed.
  const safety = setTimeout(release, SLOT_SAFETY_MS);
  const maybeUnref = safety as unknown as { unref?: () => void };
  if (typeof maybeUnref.unref === "function") maybeUnref.unref();

  try {
    // --- 5. Per-user daily quota ------------------------------------------
    if (env.dailyTokenLimit > 0) {
      const { data: usage } = await supabase
        .from("usage_today")
        .select("input_tokens, output_tokens")
        .eq("user_id", user.id)
        .maybeSingle();

      const used = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
      if (used >= env.dailyTokenLimit) {
        return NextResponse.json(
          { error: "You have reached today's usage limit. Try again tomorrow." },
          { status: 429 },
        );
      }
    }

    // --- 6. Resolve or create the conversation ----------------------------
    let conversationId = body.conversationId ?? null;

    if (conversationId) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();

      // Unknown or someone else's id (RLS hides it) -> start a fresh thread.
      if (!existing) conversationId = null;
    }

    if (!conversationId) {
      const title = text.length > 60 ? `${text.slice(0, 60)}…` : text;
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title, model: chain[0].modelId })
        .select("id")
        .single();

      if (error || !created) {
        console.error("[wade] could not create conversation", error);
        return NextResponse.json(
          { error: "Could not create the conversation." },
          { status: 500 },
        );
      }
      conversationId = created.id;
    }

    // Past this point the thread id is guaranteed to be set. Binding it to a
    // non-nullable const keeps the type honest for everything downstream.
    if (!conversationId) {
      return NextResponse.json(
        { error: "Could not create the conversation." },
        { status: 500 },
      );
    }
    const threadId: string = conversationId;

    // --- 7. Persist the user's message ------------------------------------
    // Regenerate replays the existing prompt, so it must NOT insert a second
    // copy of the user turn. Edit truncates the thread at the edited message
    // and re-inserts the edited text, so the transcript stays linear.
    if (body.editMessageId) {
      const { data: target } = await supabase
        .from("messages")
        .select("id, created_at")
        .eq("id", body.editMessageId)
        .eq("conversation_id", threadId)
        .maybeSingle();

      if (target) {
        await supabase
          .from("messages")
          .delete()
          .eq("conversation_id", threadId)
          .gte("created_at", target.created_at);
      }
    }

    if (!body.regenerate) {
      const { error: userMessageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: threadId,
          user_id: user.id,
          role: "user",
          content: text,
        });

      if (userMessageError) {
        console.error("[wade] could not save user message", userMessageError);
        return NextResponse.json(
          { error: "Could not save your message." },
          { status: 500 },
        );
      }
    }

    // --- 8. Build the context window --------------------------------------
    // Newest N messages, fetched newest-first and reversed into chronological
    // order. See src/lib/context.ts for why the old ascending+limit(200) page
    // silently dropped every recent turn past message 200.
    const contextMessages: ModelMessage[] = await loadContextMessages(
      supabase,
      threadId,
    );

    // --- 9. Open a provider stream, falling back on failure ---------------
    const startedAt = Date.now();
    const opened = await openProviderStream({
      chain,
      system: WADE_SYSTEM_PROMPT,
      messages: contextMessages,
      maxOutputTokens: env.maxOutputTokens,
      signal: request.signal,
      firstChunkTimeoutMs: env.firstChunkTimeoutMs,
    });

    // --- 10. Persist the assistant turn + usage ---------------------------
    const persist = async (input: PersistTurnInput) => {
      try {
        if (input.content.trim()) {
          const { data: saved } = await supabase
            .from("messages")
            .insert({
              conversation_id: threadId,
              user_id: user.id,
              role: "assistant",
              content: input.content,
              model: input.modelId,
              provider: input.provider,
              input_tokens: input.inputTokens,
              output_tokens: input.outputTokens,
            })
            .select("id")
            .single();

          await supabase.from("usage_events").insert({
            user_id: user.id,
            conversation_id: threadId,
            message_id: saved?.id ?? null,
            provider: input.provider,
            model: input.modelId,
            input_tokens: input.inputTokens,
            output_tokens: input.outputTokens,
            latency_ms: input.latencyMs,
            fallback_used: input.fallbackUsed,
          });
        }

        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId);
      } finally {
        // The turn is over (finished, failed, or stopped) — free the slot.
        release();
      }
    };

    return streamProviderReply({
      opened,
      chain,
      conversationId: threadId,
      persist,
      startedAt,
      signal: request.signal,
    });
  } catch (error) {
    release();

    if (error instanceof AllProvidersFailedError) {
      // Full detail stays in the server log; the client gets a generic body.
      console.error(
        "[wade] all providers failed:",
        error.attempts.map((attempt) => ({
          provider: attempt.provider,
          modelId: attempt.modelId,
          error:
            attempt.error instanceof Error
              ? attempt.error.message
              : String(attempt.error),
        })),
      );
      return NextResponse.json(
        { error: "The assistant is temporarily unavailable. Please try again." },
        { status: 502 },
      );
    }

    if (error instanceof EnvError) {
      console.error("[wade] configuration error:", error.message);
      return NextResponse.json(
        { error: "The server is not configured correctly." },
        { status: 500 },
      );
    }

    console.error("[wade] unexpected error handling turn", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  } finally {
    clearTimeout(safety);
  }
}
