"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, Conversation } from "@/lib/types";
import { Sidebar } from "./sidebar";
import { MessageList } from "./message-list";
import { Composer } from "./composer";

/**
 * The chat shell: owns all client state and talks to /api/chat.
 *
 * Streaming is done by hand with fetch + a ReadableStream reader rather than
 * the AI SDK's useChat hook, because the route returns a plain text stream and
 * we want to persist the conversation id from the response headers.
 */
export function ChatShell({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // --- Data loading --------------------------------------------------------
  const loadConversations = useCallback(async () => {
    const { data, error: listError } = await supabase
      .from("conversations")
      .select("id, title, model, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (listError) {
      setError(listError.message);
      return;
    }
    setConversations((data ?? []) as Conversation[]);
  }, [supabase]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const openConversation = useCallback(
    async (id: string) => {
      setActiveId(id);
      setSidebarOpen(false);
      setError(null);
      setLoadingMessages(true);

      const { data, error: loadError } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, role, content, model, provider, created_at",
        )
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      if (loadError) setError(loadError.message);
      setMessages((data ?? []) as ChatMessage[]);
      setLoadingMessages(false);
    },
    [supabase],
  );

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setStreamingText(null);
    setError(null);
    setInput("");
    setSidebarOpen(false);
  }, []);

  // --- Conversation management --------------------------------------------
  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const clean = title.trim();
      if (!clean) return;
      await supabase.from("conversations").update({ title: clean }).eq("id", id);
      await loadConversations();
    },
    [supabase, loadConversations],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await supabase.from("conversations").delete().eq("id", id);
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      await loadConversations();
    },
    [supabase, activeId, loadConversations],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);

  // --- Sending -------------------------------------------------------------
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || isStreaming) return;

      setError(null);
      setInput("");

      const optimistic: ChatMessage = {
        id: `local-user-${Date.now()}`,
        conversation_id: activeId ?? "",
        role: "user",
        content: text,
        model: null,
        provider: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setStreamingText("");
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";
      let newConversationId: string | null = null;
      let provider: string | null = null;
      let model: string | null = null;

      const commit = (content: string) => {
        if (!content.trim()) return;
        setMessages((prev) => [
          ...prev,
          {
            id: `local-assistant-${Date.now()}`,
            conversation_id: newConversationId ?? activeId ?? "",
            role: "assistant",
            content,
            model,
            provider,
            created_at: new Date().toISOString(),
          },
        ]);
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeId, message: text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response
            .json()
            .catch(() => ({ error: null }))) as { error?: string } | null;
          throw new Error(
            payload?.error ?? `Request failed with status ${response.status}.`,
          );
        }

        newConversationId = response.headers.get("X-Conversation-Id");
        provider = response.headers.get("X-Wade-Provider");
        model = response.headers.get("X-Wade-Model");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("The response had no readable body.");

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setStreamingText(accumulated);
        }
        accumulated += decoder.decode();

        commit(accumulated);

        if (newConversationId && newConversationId !== activeId) {
          setActiveId(newConversationId);
        }
        await loadConversations();
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (isAbort) {
          // Keep whatever the model managed to produce before the stop.
          commit(accumulated ? `${accumulated}\n\n_(stopped)_` : "");
        } else {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        }
      } finally {
        setStreamingText(null);
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [activeId, isStreaming, loadConversations],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // --- Render --------------------------------------------------------------
  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        userEmail={userEmail}
        onSelect={openConversation}
        onNew={startNewChat}
        onRename={renameConversation}
        onDelete={deleteConversation}
        onSignOut={signOut}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
            className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:bg-white/5 md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-white">
              WADE
            </span>
            <span className="hidden truncate text-xs text-zinc-500 sm:inline">
              {activeId
                ? conversations.find((c) => c.id === activeId)?.title ?? ""
                : "New chat"}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400 sm:inline">
              Gemini Flash → Groq fallback
            </span>
            <button
              type="button"
              onClick={startNewChat}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
            >
              New chat
            </button>
          </div>
        </header>

        {error && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        <MessageList
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          loading={loadingMessages}
          onSuggestion={(suggestion) => setInput(suggestion)}
        />

        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
