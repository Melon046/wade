"use client";

import { useEffect, useId, useRef } from "react";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  /** Mirrors the API's MAX_INPUT_CHARS so the limit is visible before send. */
  maxLength?: number;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  maxLength = 8000,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaId = useId();
  const counterId = useId();
  const hintId = useId();

  // Grow the textarea with its content, up to a ceiling.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const length = value.length;
  const overLimit = length > maxLength;
  const nearLimit = length > maxLength * 0.9;
  const canSend = value.trim().length > 0 && !overLimit && !isStreaming;

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-white/10 bg-[var(--color-canvas)]/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={`flex items-end gap-2 rounded-2xl border bg-white/[0.03] p-2 transition focus-within:ring-2 ${
            overLimit
              ? "border-red-500/60 focus-within:ring-red-500/20"
              : "border-white/10 focus-within:border-[var(--color-brand)]/50 focus-within:ring-[var(--color-brand)]/15"
          }`}
        >
          <label htmlFor={textareaId} className="wade-visually-hidden">
            Message WADE
          </label>
          <textarea
            id={textareaId}
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message WADE…  (Enter to send, Shift+Enter for a new line)"
            aria-invalid={overLimit || undefined}
            aria-describedby={`${hintId} ${counterId}`}
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-[0.9375rem] leading-6 text-[var(--color-ink-1)] placeholder-[var(--color-ink-5)]"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-[var(--color-ink-2)] transition hover:bg-white/10"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-violet)] p-2.5 text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <p id={hintId} className="text-[11px] text-[var(--color-ink-5)]">
            WADE can make mistakes. Verify anything important.
          </p>
          <p
            id={counterId}
            aria-live="polite"
            className={`shrink-0 text-[11px] tabular-nums ${
              overLimit
                ? "font-medium text-red-400"
                : nearLimit
                  ? "text-amber-400"
                  : "text-[var(--color-ink-5)]"
            }`}
          >
            {nearLimit || overLimit
              ? `${length.toLocaleString()} / ${maxLength.toLocaleString()}`
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
