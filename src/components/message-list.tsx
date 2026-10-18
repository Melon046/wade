"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { Markdown } from "./markdown";
import { providerLabel } from "@/lib/pricing";

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string | null;
  isStreaming: boolean;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onSuggestion: (text: string) => void;
  onCopy: (content: string) => void;
  onEdit: (message: ChatMessage) => void;
  onRegenerate: () => void;
  editingId: string | null;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, content: string) => void;
}

const SUGGESTIONS = [
  "Explain how Row Level Security works in Postgres, with an example.",
  "Write a TypeScript function that debounces an async call.",
  "Compare Gemini Flash and Llama 3.3 70B for a free-tier chat app.",
  "Draft a 5-step plan to launch a side project in 30 days.",
];

export function MessageList({
  messages,
  streamingText,
  isStreaming,
  loading,
  loadError,
  onRetry,
  onSuggestion,
  onCopy,
  onEdit,
  onRegenerate,
  editingId,
  onCancelEdit,
  onSaveEdit,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // Auto-scroll only while the user is already at the bottom, so reading back
  // through a long answer is never yanked away by incoming tokens.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distance < 80;
  }, []);

  useEffect(() => {
    if (pinnedRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, streamingText]);

  const isEmpty = messages.length === 0 && !isStreaming && !loading;
  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        {loading && <LoadingState />}

        {!loading && loadError && (
          <ErrorState message={loadError} onRetry={onRetry} />
        )}

        {isEmpty && !loadError && <EmptyState onSuggestion={onSuggestion} />}

        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="Conversation"
          className="space-y-6"
        >
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              isLastAssistant={message.id === lastAssistantId}
              isStreaming={isStreaming}
              editing={editingId === message.id}
              onCopy={onCopy}
              onEdit={onEdit}
              onRegenerate={onRegenerate}
              onCancelEdit={onCancelEdit}
              onSaveEdit={onSaveEdit}
            />
          ))}

          {isStreaming && (
            <div className="flex gap-3">
              <Avatar role="assistant" />
              <div className="min-w-0 flex-1 pt-0.5">
                {streamingText ? (
                  <div className="wade-caret">
                    <Markdown content={streamingText} />
                  </div>
                ) : (
                  <ThinkingDots />
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-violet)] text-2xl font-bold text-white shadow-lg shadow-indigo-500/20">
        W
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-1)]">
        How can I help?
      </h1>
      <p className="mt-2 max-w-md text-sm text-[var(--color-ink-4)]">
        Ask anything. Your conversations are saved to your account and stay
        private to you.
      </p>

      <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-[var(--color-ink-3)] transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading conversation">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3">
          <div className="mt-0.5 h-7 w-7 shrink-0 animate-pulse rounded-lg bg-white/[0.06]" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.05]" />
          </div>
        </div>
      ))}
      <span className="wade-visually-hidden">Loading conversation…</span>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-300">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-[var(--color-ink-1)]">
        We couldn&apos;t load this conversation
      </h2>
      <p className="mt-2 max-w-sm text-sm text-[var(--color-ink-4)]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-[var(--color-ink-2)] transition hover:bg-white/10"
      >
        Try again
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

function MessageRow({
  message,
  isLastAssistant,
  isStreaming,
  editing,
  onCopy,
  onEdit,
  onRegenerate,
  onCancelEdit,
  onSaveEdit,
}: {
  message: ChatMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
  editing: boolean;
  onCopy: (content: string) => void;
  onEdit: (message: ChatMessage) => void;
  onRegenerate: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, content: string) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    onCopy(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [message.content, onCopy]);

  if (editing) {
    return (
      <EditRow
        message={message}
        onCancel={onCancelEdit}
        onSave={(content) => onSaveEdit(message.id, content)}
      />
    );
  }

  return (
    <div className="wade-row group flex gap-3">
      <Avatar role={isUser ? "user" : "assistant"} />
      <div className="min-w-0 flex-1 pt-0.5">
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-7 text-[var(--color-ink-2)]">
            {message.content}
          </p>
        ) : (
          <>
            <Markdown content={message.content} />
            {message.provider && (
              <p className="mt-2 text-[11px] text-[var(--color-ink-5)]">
                {providerLabel(message.provider)}
                {message.model ? ` · ${message.model}` : ""}
              </p>
            )}
          </>
        )}

        {/* Real buttons — keyboard reachable, never display:none. */}
        <div className="wade-actions mt-2 flex items-center gap-1">
          <ActionButton
            label={copied ? "Copied" : "Copy message"}
            onClick={handleCopy}
            active={copied}
          >
            {copied ? (
              <path d="M20 6 9 17l-5-5" />
            ) : (
              <>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </>
            )}
          </ActionButton>

          {isUser && (
            <ActionButton label="Edit and resend" onClick={() => onEdit(message)}>
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </ActionButton>
          )}

          {!isUser && isLastAssistant && !isStreaming && (
            <ActionButton label="Regenerate answer" onClick={onRegenerate}>
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

function EditRow({
  message,
  onCancel,
  onSave,
}: {
  message: ChatMessage;
  onCancel: () => void;
  onSave: (content: string) => void;
}) {
  const [value, setValue] = useState(message.content);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, []);

  return (
    <div className="flex gap-3">
      <Avatar role="user" />
      <div className="min-w-0 flex-1 pt-0.5">
        <label htmlFor={`edit-${message.id}`} className="wade-visually-hidden">
          Edit your message
        </label>
        <textarea
          id={`edit-${message.id}`}
          ref={ref}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            const el = event.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (value.trim()) onSave(value.trim());
            }
          }}
          className="w-full resize-none rounded-xl border border-white/15 bg-black/30 px-3.5 py-2.5 text-[0.9375rem] leading-6 text-[var(--color-ink-1)] transition focus:border-[var(--color-brand)]/60"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => value.trim() && onSave(value.trim())}
            disabled={!value.trim()}
            className="rounded-lg bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-violet)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save &amp; resend
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-[var(--color-ink-3)] transition hover:bg-white/5"
          >
            Cancel
          </button>
          <span className="text-[11px] text-[var(--color-ink-5)]">
            Esc to cancel · ⌘/Ctrl+Enter to save
          </span>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-md p-1.5 transition hover:bg-white/10 ${
        active
          ? "text-emerald-400"
          : "text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)]"
      }`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "user") {
    return (
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[11px] font-semibold text-[var(--color-ink-3)]">
        You
      </div>
    );
  }
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-violet)] text-[11px] font-bold text-white">
      W
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1.5" role="status">
      <span className="wade-visually-hidden">WADE is thinking</span>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-ink-5)]"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}
