"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/types";
import { Markdown } from "./markdown";

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string | null;
  isStreaming: boolean;
  loading: boolean;
  onSuggestion: (text: string) => void;
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
  onSuggestion,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingText]);

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        {loading && (
          <p className="py-8 text-center text-sm text-zinc-500">
            Loading conversation…
          </p>
        )}

        {isEmpty && !loading && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-bold text-white shadow-lg shadow-indigo-500/20">
              W
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              How can I help?
            </h1>
            <p className="mt-2 max-w-md text-sm text-zinc-400">
              Ask anything. Your conversations are saved to your account and
              stay private to you.
            </p>

            <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSuggestion(suggestion)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} />
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

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className="flex gap-3">
      <Avatar role={isUser ? "user" : "assistant"} />
      <div className="min-w-0 flex-1 pt-0.5">
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-7 text-zinc-100">
            {message.content}
          </p>
        ) : (
          <>
            <Markdown content={message.content} />
            {message.provider && (
              <p className="mt-2 text-[11px] text-zinc-600">
                {message.provider === "google" ? "Gemini Flash" : "Llama (Groq)"}
                {message.model ? ` · ${message.model}` : ""}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "user") {
    return (
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[11px] font-semibold text-zinc-300">
        You
      </div>
    );
  }
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
      W
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1.5" aria-label="Thinking">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}
