"use client";

import type { Conversation } from "@/lib/types";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  userEmail: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
  onClose: () => void;
}

export function Sidebar({
  conversations,
  activeId,
  open,
  userEmail,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onSignOut,
  onClose,
}: SidebarProps) {
  function handleRename(conversation: Conversation) {
    const next = window.prompt("Rename conversation", conversation.title);
    if (next !== null) onRename(conversation.id, next);
  }

  function handleDelete(conversation: Conversation) {
    const ok = window.confirm(
      `Delete "${conversation.title}"? This cannot be undone.`,
    );
    if (ok) onDelete(conversation.id);
  }

  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/10 bg-zinc-950 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
            W
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">
            WADE
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversations"
            className="ml-auto rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/5 md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={onNew}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.08]"
          >
            + New chat
          </button>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
          {conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-zinc-500">
              No conversations yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeId;
                return (
                  <li key={conversation.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      className={`w-full truncate rounded-lg px-3 py-2 pr-16 text-left text-sm transition ${
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                      }`}
                      title={conversation.title}
                    >
                      {conversation.title}
                    </button>

                    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleRename(conversation)}
                        aria-label="Rename conversation"
                        className="rounded-md p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(conversation)}
                        aria-label="Delete conversation"
                        className="rounded-md p-1.5 text-zinc-400 transition hover:bg-red-500/15 hover:text-red-300"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="border-t border-white/10 p-3">
          <p className="truncate px-1 text-xs text-zinc-500" title={userEmail}>
            {userEmail}
          </p>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
