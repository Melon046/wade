"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, Conversation } from "@/lib/types";
import { Sidebar } from "./sidebar";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { AppHeader } from "./app-header";
import { DialogProvider } from "./dialog";
import { streamAssistantReply, toUserMessage } from "@/lib/stream";

/**
 * The chat shell: owns all client state and talks to /api/chat.
 *
 * Streaming goes through `streamAssistantReply` in lib/stream.ts — one code
 * path shared by send, regenerate and edit-and-resend, so the streaming UI
 * cannot drift between entry points.
 */
export function ChatShell({ userEmail }: { userEmail: string }) {
  return (
    <DialogProvider>
      <ChatShellInner userEmail={userEmail} />
    </DialogProvider>
  );
}

function ChatShellInner({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef("");

  // --- Data loading --------------------------------------------------------
  const loadConversations = useCallback(async () => {
    const { data, error: listError } = await supabase
      .from("conversations")
      .select("id, title, model, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (listError) {
      // Never surface the raw database message — it can name tables, columns
      // and policies. The user gets a plain sentence; the detail is logged.
      console.error("[wade] could not load conversations", listError);
      setError("We couldn't load your conversations. Please try again.");
      return;
    }
    setConversations((data ?? []) as Conversation[]);
  }, [supabase]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const openConversation = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      setActiveId(id);
      setSidebarOpen(false);
      setError(null);
      setLoadError(null);
      setEditingId(null);
      setLoadingMessages(true);

      const { data, error: loadErr } = await supabase
        .from("messages")
        .select("id, conversation_id, role, content, model, provider, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      if (loadErr) {
        console.error("[wade] could not load messages", loadErr);
        setLoadError("We couldn't load this conversation. Please try again.");
        setMessages([]);
      } else {
        setMessages((data ?? []) as ChatMessage[]);
      }
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
    setLoadError(null);
    setEditingId(null);
    setInput("");
    setSidebarOpen(false);
  }, []);

  // --- Conversation management --------------------------------------------
  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const clean = title.trim();
      if (!clean) return;
      const { error: renameError } = await supabase
        .from("conversations")
        .update({ title: clean })
        .eq("id", id);
      if (renameError) {
        console.error("[wade] could not rename conversation", renameError);
        setError("We couldn't rename that conversation. Please try again.");
        return;
      }
      await loadConversations();
    },
    [supabase, loadConversations],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const { error: deleteError } = await supabase
        .from("conversations")
        .delete()
        .eq("id", id);
      if (deleteError) {
        console.error("[wade] could not delete conversation", deleteError);
        setError("We couldn't delete that conversation. Please try again.");
        return;
      }
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

  // --- The one streaming path ---------------------------------------------
  const commitAssistant = useCallback(
    (
      content: string,
      conversationId: string | null,
      provider: string | null,
      model: string | null,
      stopped: boolean,
    ) => {
      if (!content.trim()) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `local-assistant-${Date.now()}`,
          conversation_id: conversationId ?? activeId ?? "",
          role: "assistant",
          content: stopped ? `${content}\n\n_(stopped)_` : content,
          model,
          provider,
          created_at: new Date().toISOString(),
        },
      ]);
    },
    [activeId],
  );

  const runTurn = useCallback(
    async (params: {
      message: string;
      conversationId: string | null;
      regenerate?: boolean;
      editMessageId?: string;
    }) => {
      if (isStreaming) return;

      setError(null);
      setStreamingText("");
      setIsStreaming(true);
      accumulatedRef.current = "";

      const controller = new AbortController();
      abortRef.current = controller;

      let provider: string | null = null;
      let model: string | null = null;
      let newConversationId: string | null = params.conversationId;

      try {
        const result = await streamAssistantReply({
          conversationId: params.conversationId,
          message: params.message,
          regenerate: params.regenerate,
          editMessageId: params.editMessageId,
          signal: controller.signal,
          onChunk: (text) => {
            accumulatedRef.current = text;
            setStreamingText(text);
          },
        });

        provider = result.provider;
        model = result.model;
        newConversationId = result.conversationId;

        // Keep whatever the model produced, whether it finished cleanly or the
        // user pressed Stop. Losing a half-written reply is the worst outcome.
        commitAssistant(
          result.content,
          newConversationId,
          provider,
          model,
          result.aborted,
        );

        if (newConversationId && newConversationId !== activeId) {
          setActiveId(newConversationId);
        }
        await loadConversations();
      } catch (err) {
        // A mid-stream failure still keeps the partial text.
        commitAssistant(
          accumulatedRef.current,
          newConversationId,
          provider,
          model,
          false,
        );
        setError(
          toUserMessage(err, "Something went wrong. Please try again."),
        );
      } finally {
        setStreamingText(null);
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [activeId, isStreaming, loadConversations, commitAssistant],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || isStreaming) return;

      setInput("");
      setEditingId(null);

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

      await runTurn({ message: text, conversationId: activeId });
    },
    [activeId, isStreaming, runTurn],
  );

  /**
   * Regenerate — replace in place.
   *
   * The trailing assistant turn is dropped locally and the original prompt is
   * replayed, so the thread stays a clean linear transcript instead of
   * accumulating duplicate answers.
   */
  const regenerate = useCallback(async () => {
    if (isStreaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === lastUser.id);
      return index === -1 ? prev : prev.slice(0, index + 1);
    });

    await runTurn({
      message: lastUser.content,
      conversationId: activeId,
      regenerate: true,
    });
  }, [messages, activeId, isStreaming, runTurn]);

  /**
   * Edit — truncate and resend.
   *
   * The edited message and everything after it are dropped, then the edited
   * text is sent. This is what people expect from a chat box.
   */
  const saveEdit = useCallback(
    async (id: string, content: string) => {
      setEditingId(null);
      setMessages((prev) => {
        const index = prev.findIndex((m) => m.id === id);
        if (index === -1) return prev;
        return [...prev.slice(0, index), { ...prev[index], content }];
      });
      await runTurn({
        message: content,
        conversationId: activeId,
        editMessageId: id,
      });
    },
    [activeId, runTurn],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const copy = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Clipboard access can be denied; the button still gives visual feedback.
    }
  }, []);

  // --- Render --------------------------------------------------------------
  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--color-canvas)]">
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
        <AppHeader
          showSidebarToggle
          onOpenSidebar={() => setSidebarOpen(true)}
          right={
            <>
              <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--color-ink-4)] lg:inline">
                Gemini Flash → Groq fallback
              </span>
              <button
                type="button"
                onClick={startNewChat}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-[var(--color-ink-1)] transition hover:bg-white/15"
              >
                New chat
              </button>
            </>
          }
        />

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 border-b border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-200"
          >
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="shrink-0 rounded-md p-1 text-red-200/80 transition hover:bg-red-500/20 hover:text-red-100"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <MessageList
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          loading={loadingMessages}
          loadError={loadError}
          onRetry={() => (activeId ? openConversation(activeId) : undefined)}
          onSuggestion={(suggestion) => setInput(suggestion)}
          onCopy={copy}
          onEdit={(message) => setEditingId(message.id)}
          onRegenerate={regenerate}
          editingId={editingId}
          onCancelEdit={() => setEditingId(null)}
          onSaveEdit={saveEdit}
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
