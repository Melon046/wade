/**
 * One streaming code path.
 *
 * Send, regenerate and edit-and-resend all funnel through
 * `streamAssistantReply`. Before this they were three near-copies of the same
 * fetch + reader loop, which is exactly how the streaming UI drifts between
 * entry points (one of them forgets to keep partial output, another forgets to
 * clear the abort controller). There is now one implementation.
 */

export interface StreamAssistantReplyOptions {
  /** Existing conversation, or null to start a new one. */
  conversationId: string | null;
  /** The user's text. For regenerate this is the original prompt. */
  message: string;
  /** Re-run the last turn without inserting a new user message. */
  regenerate?: boolean;
  /** Replace this user message and drop everything after it. */
  editMessageId?: string;
  signal: AbortSignal;
  /** Called with the accumulated text on every chunk. */
  onChunk?: (accumulated: string) => void;
}

export interface StreamAssistantReplyResult {
  conversationId: string | null;
  provider: string | null;
  model: string | null;
  content: string;
  aborted: boolean;
}

export class ChatRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * The route already returns generic bodies, but a defensive pass keeps a raw
 * provider or database string from ever reaching the DOM if one slips through.
 */
const LEAKY = /(supabase|postgres|pg_|groq|google|generativelanguage|api[_\s-]?key|sk-|bearer|stack|econnrefused|fetch failed)/i;

export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof ChatRequestError) {
    return LEAKY.test(error.message) ? fallback : error.message;
  }
  if (error instanceof Error) {
    return LEAKY.test(error.message) ? fallback : error.message;
  }
  return fallback;
}

function defaultMessageForStatus(status: number): string {
  if (status === 401) return "Your session has expired. Sign in again to continue.";
  if (status === 413) return "That message is too long. Shorten it and try again.";
  if (status === 429) return "You are sending messages too quickly. Wait a moment and try again.";
  if (status === 502) return "The assistant is temporarily unavailable. Please try again.";
  if (status === 503) return "No model provider is configured on the server.";
  if (status >= 500) return "Something went wrong on the server. Please try again.";
  return "The request could not be completed. Please try again.";
}

export async function streamAssistantReply(
  options: StreamAssistantReplyOptions,
): Promise<StreamAssistantReplyResult> {
  const {
    conversationId,
    message,
    regenerate,
    editMessageId,
    signal,
    onChunk,
  } = options;

  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message,
        regenerate: regenerate || undefined,
        editMessageId: editMessageId || undefined,
      }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      return {
        conversationId,
        provider: null,
        model: null,
        content: "",
        aborted: true,
      };
    }
    throw new ChatRequestError(
      "Could not reach the server. Check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as { error?: string } | null;
    throw new ChatRequestError(
      payload?.error ?? defaultMessageForStatus(response.status),
      response.status,
    );
  }

  const nextConversationId = response.headers.get("X-Conversation-Id");
  const provider = response.headers.get("X-Wade-Provider");
  const model = response.headers.get("X-Wade-Model");

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ChatRequestError(
      "The server returned an empty response. Please try again.",
      response.status,
    );
  }

  const decoder = new TextDecoder();
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      onChunk?.(accumulated);
    }
    accumulated += decoder.decode();
  } catch (error) {
    if (isAbortError(error)) {
      // Whatever arrived before the abort is still returned — the caller keeps
      // partial output rather than losing a half-written reply.
      return {
        conversationId: nextConversationId ?? conversationId,
        provider,
        model,
        content: accumulated,
        aborted: true,
      };
    }
    throw error;
  }

  return {
    conversationId: nextConversationId ?? conversationId,
    provider,
    model,
    content: accumulated,
    aborted: false,
  };
}
