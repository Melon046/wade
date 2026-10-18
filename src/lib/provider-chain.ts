/**
 * Provider chain execution.
 *
 * Three bugs lived in the old inline loop, and this module is the fix for all
 * three:
 *
 *   1. **The fallback never fired.** The loop pulled the first chunk and, if
 *      that succeeded, committed to the provider. But a provider that fails
 *      *after* the first chunk (or that returns an empty stream) was treated as
 *      a success, so Groq was never reached.
 *   2. **An empty stream returned 200.** A provider that produced zero tokens
 *      still got a `200` with an empty body, so the client rendered nothing and
 *      reported no error.
 *   3. **Partial replies were lost.** If the provider died mid-stream, the
 *      bytes already sent to the user were never written to the database, so a
 *      reload showed a question with no answer.
 *
 * The contract now: a provider is only "committed to" once it has produced at
 * least one token. Anything else falls through to the next provider, and if
 * every provider fails the caller gets a typed error to turn into a 502.
 */

import {
  streamText,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import type { ModelChoice, ProviderName } from "./models";

export interface ProviderAttempt {
  provider: ProviderName;
  modelId: string;
  error: unknown;
}

/** Thrown when every provider in the chain failed before producing a token. */
export class AllProvidersFailedError extends Error {
  readonly attempts: ProviderAttempt[];

  constructor(attempts: ProviderAttempt[]) {
    super(`All ${attempts.length} provider(s) failed to produce a reply.`);
    this.name = "AllProvidersFailedError";
    this.attempts = attempts;
  }
}

export interface OpenedStream {
  choice: ModelChoice;
  result: ReturnType<typeof streamText>;
  iterator: AsyncIterator<string>;
  /** The first token, already pulled so the provider is known to be alive. */
  firstChunk: string;
}

/**
 * Link a caller signal to a local controller and add a first-token deadline.
 * The abort link stays attached for the life of the stream (so a client Stop
 * still cancels the provider); only the deadline is cleared once the first
 * token arrives.
 */
function linkWithDeadline(signal: AbortSignal, ms: number) {
  const controller = new AbortController();

  const forward = () => controller.abort(signal.reason);
  if (signal.aborted) forward();
  else signal.addEventListener("abort", forward, { once: true });

  const timer = setTimeout(
    () => controller.abort(new Error("Provider did not respond in time.")),
    ms,
  );
  const maybeUnref = timer as unknown as { unref?: () => void };
  if (typeof maybeUnref.unref === "function") maybeUnref.unref();

  return {
    signal: controller.signal,
    clearDeadline: () => clearTimeout(timer),
  };
}

/**
 * Walk the chain until a provider yields its first token.
 *
 * A provider is skipped when it throws (bad key, 429, retired model id) *or*
 * when it returns an empty stream — both mean "this provider cannot answer",
 * and both should hand over to the next one.
 */
export async function openProviderStream(params: {
  chain: ModelChoice[];
  system: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
  firstChunkTimeoutMs: number;
}): Promise<OpenedStream> {
  const attempts: ProviderAttempt[] = [];

  for (const choice of params.chain) {
    const guard = linkWithDeadline(params.signal, params.firstChunkTimeoutMs);

    try {
      const result = streamText({
        model: choice.model,
        system: params.system,
        messages: params.messages,
        maxOutputTokens: params.maxOutputTokens,
        temperature: 0.7,
        abortSignal: guard.signal,
      });

      const iterator = result.textStream[Symbol.asyncIterator]();
      const first = await iterator.next();
      guard.clearDeadline();

      if (first.done || !first.value) {
        attempts.push({
          provider: choice.provider,
          modelId: choice.modelId,
          error: new Error("Provider returned an empty stream."),
        });
        console.warn(
          `[wade] provider "${choice.provider}" (${choice.modelId}) returned an empty stream, trying next`,
        );
        continue;
      }

      return { choice, result, iterator, firstChunk: first.value };
    } catch (error) {
      guard.clearDeadline();
      attempts.push({
        provider: choice.provider,
        modelId: choice.modelId,
        error,
      });
      console.warn(
        `[wade] provider "${choice.provider}" (${choice.modelId}) failed, trying next`,
        error,
      );
    }
  }

  throw new AllProvidersFailedError(attempts);
}

export interface PersistTurnInput {
  content: string;
  modelId: string;
  provider: ProviderName;
  inputTokens: number;
  outputTokens: number;
  fallbackUsed: boolean;
  latencyMs: number;
  /** False when the reply was cut short by an error or a client Stop. */
  completed: boolean;
}

export type PersistTurn = (input: PersistTurnInput) => Promise<void>;

/** Read token usage without letting a hung provider stall the response. */
async function readUsage(
  result: ReturnType<typeof streamText>,
): Promise<LanguageModelUsage | undefined> {
  try {
    const timeout = new Promise<undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), 2_000);
      const maybeUnref = timer as unknown as { unref?: () => void };
      if (typeof maybeUnref.unref === "function") maybeUnref.unref();
    });
    return await Promise.race([result.usage, timeout]);
  } catch {
    return undefined;
  }
}

/**
 * Turn an opened provider stream into the HTTP response.
 *
 * The assistant turn is persisted on **every** exit path — clean finish,
 * mid-stream failure, and client Stop — so a partial reply is never lost. The
 * stream is only errored (rather than closed) when the failure was the
 * provider's, so the client can tell "interrupted" apart from "stopped".
 */
export function streamProviderReply(params: {
  opened: OpenedStream;
  chain: ModelChoice[];
  conversationId: string;
  persist: PersistTurn;
  startedAt: number;
  signal: AbortSignal;
}): Response {
  const { opened, chain, conversationId, persist, startedAt, signal } = params;
  const { choice, result, iterator, firstChunk } = opened;

  const encoder = new TextEncoder();
  let accumulated = "";
  let settled = false;

  const finalize = async (completed: boolean) => {
    if (settled) return;
    settled = true;

    const usage = await readUsage(result);
    try {
      await persist({
        content: accumulated,
        modelId: choice.modelId,
        provider: choice.provider,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        fallbackUsed: choice !== chain[0],
        latencyMs: Date.now() - startedAt,
        completed,
      });
    } catch (error) {
      // Never fail the user's reply because bookkeeping failed.
      console.error("[wade] failed to persist turn", error);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        accumulated += firstChunk;
        controller.enqueue(encoder.encode(firstChunk));

        while (true) {
          const next = await iterator.next();
          if (next.done) break;
          accumulated += next.value;
          controller.enqueue(encoder.encode(next.value));
        }
      } catch (error) {
        const aborted = signal.aborted;
        await finalize(false);

        if (aborted) {
          // The user pressed Stop. Keep the partial reply, end cleanly.
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        } else {
          console.error("[wade] stream failed mid-flight", error);
          try {
            controller.error(error);
          } catch {
            /* already closed */
          }
        }
        return;
      }

      await finalize(true);
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },

    async cancel() {
      // Client disconnected or pressed Stop: persist what we have.
      await finalize(false);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Conversation-Id": conversationId,
      "X-Wade-Provider": choice.provider,
      "X-Wade-Model": choice.modelId,
    },
  });
}
