import { NextResponse, type NextRequest } from "next/server";
import {
  streamText,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { createClient } from "@/lib/supabase/server";
import { resolveModelChain, type ModelChoice } from "@/lib/models";
import { BATCHER_SYSTEM_PROMPT } from "@/lib/prompt";

/**
 * Streaming chat endpoint.
 *
 * Contract
 *   POST /api/chat
 *   body: { conversationId?: string, message: string }
 *   200 : text/plain stream of the assistant's reply, chunked as it is produced
 *   401 : not signed in
 *   429 : daily token limit reached
 *   503 : no provider configured
 *   502 : every provider in the chain failed
 *
 * Response headers
 *   X-Conversation-Id : the conversation the turn was written to (new or existing)
 *   X-Batcher-Provider   : "google" | "groq" — which provider actually answered
 *   X-Batcher-Model      : the model id that answered
 *
 * The API keys never leave this process. The browser only ever talks to this
 * route, which is the whole point of not calling the provider from the client.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/** How many prior messages to replay as context. */
const MAX_CONTEXT_MESSAGES = 20;

const MAX_OUTPUT_TOKENS = Number(process.env.BATCHER_MAX_OUTPUT_TOKENS ?? 2048);

/** 0 disables the per-user daily cap. */
const DAILY_TOKEN_LIMIT = Number(process.env.BATCHER_DAILY_TOKEN_LIMIT ?? 0);

const MAX_INPUT_CHARS = 8000;

export async function POST(request: NextRequest) {
  // --- 1. Authenticate -----------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // --- 2. Validate input ---------------------------------------------------
  let body: { conversationId?: string; message?: string };
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

  // --- 4. Per-user daily quota --------------------------------------------
  if (DAILY_TOKEN_LIMIT > 0) {
    const { data: usage } = await supabase
      .from("usage_today")
      .select("input_tokens, output_tokens")
      .eq("user_id", user.id)
      .maybeSingle();

    const used = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
    if (used >= DAILY_TOKEN_LIMIT) {
      return NextResponse.json(
        { error: "You have reached today's usage limit. Try again tomorrow." },
        { status: 429 },
      );
    }
  }

  // --- 5. Resolve or create the conversation ------------------------------
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
      return NextResponse.json(
        { error: "Could not create the conversation." },
        { status: 500 },
      );
    }
    conversationId = created.id;
  }

  // --- 6. Persist the user's message --------------------------------------
  const { error: userMessageError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: text,
  });

  if (userMessageError) {
    return NextResponse.json(
      { error: "Could not save your message." },
      { status: 500 },
    );
  }

  // --- 7. Build the context window ----------------------------------------
  const { data: history } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  const contextMessages: ModelMessage[] = (history ?? [])
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((row) => ({
      role: row.role as "user" | "assistant" | "system",
      content: row.content,
    }));

  // --- 8. Start the stream, falling back on failure -----------------------
  const startedAt = Date.now();
  let answered: ModelChoice | null = null;
  let stream: ReadableStream<Uint8Array> | null = null;
  let lastError: unknown = null;

  for (const choice of chain) {
    try {
      const result = streamText({
        model: choice.model,
        system: BATCHER_SYSTEM_PROMPT,
        messages: contextMessages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.7,
        abortSignal: request.signal,
      });

      // Pull the first chunk *before* committing to this provider. A rate
      // limit or a bad model id surfaces here, which is what lets us fall
      // through to the next provider instead of streaming a broken response.
      const iterator = result.textStream[Symbol.asyncIterator]();
      const first = await iterator.next();

      answered = choice;

      stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          let accumulated = "";

          try {
            if (!first.done && first.value) {
              accumulated += first.value;
              controller.enqueue(encoder.encode(first.value));
            }

            while (true) {
              const next = await iterator.next();
              if (next.done) break;
              accumulated += next.value;
              controller.enqueue(encoder.encode(next.value));
            }
          } catch (streamError) {
            // The provider died mid-stream. The client already has partial
            // text; surface the failure rather than pretending it finished.
            console.error("[batcher] stream failed mid-flight", streamError);
            controller.error(streamError);
            return;
          }

          // --- Persist the assistant turn + usage -------------------------
          try {
            let usage: LanguageModelUsage | undefined;
            try {
              usage = await result.usage;
            } catch {
              usage = undefined;
            }
            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;

            const { data: saved } = await supabase
              .from("messages")
              .insert({
                conversation_id: conversationId,
                user_id: user.id,
                role: "assistant",
                content: accumulated,
                model: choice.modelId,
                provider: choice.provider,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
              })
              .select("id")
              .single();

            await supabase.from("usage_events").insert({
              user_id: user.id,
              conversation_id: conversationId,
              message_id: saved?.id ?? null,
              provider: choice.provider,
              model: choice.modelId,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              latency_ms: Date.now() - startedAt,
              fallback_used: choice !== chain[0],
            });

            await supabase
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId);
          } catch (persistError) {
            // Never fail the user's reply because bookkeeping failed.
            console.error("[batcher] failed to persist turn", persistError);
          }

          controller.close();
        },
      });

      break;
    } catch (providerError) {
      lastError = providerError;
      console.warn(
        `[batcher] provider "${choice.provider}" (${choice.modelId}) failed, trying next`,
        providerError,
      );
    }
  }

  if (!stream || !answered) {
    const detail =
      lastError instanceof Error ? lastError.message : "Unknown provider error";
    return NextResponse.json(
      { error: `All providers failed. Last error: ${detail}` },
      { status: 502 },
    );
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Conversation-Id": conversationId ?? "",
      "X-Batcher-Provider": answered.provider,
      "X-Batcher-Model": answered.modelId,
    },
  });
}
