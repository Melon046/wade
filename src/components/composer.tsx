"use client";

import { useEffect, useRef } from "react";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea with its content, up to a ceiling.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || isStreaming) return;
    onSend(text);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 transition focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/15">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message BATCHER…  (Enter to send, Shift+Enter for a new line)"
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-[0.9375rem] leading-6 text-white placeholder-zinc-500 outline-none"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim()}
              aria-label="Send message"
              className="shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 p-2.5 text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>

        <p className="mt-2 text-center text-[11px] text-zinc-600">
          BATCHER can make mistakes. Verify anything important.
        </p>
      </div>
    </div>
  );
}
