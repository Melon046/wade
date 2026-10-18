"use client";

import { useState } from "react";

/**
 * BYOK settings.
 *
 * The UI is finished and honest about its own state: until the /api/keys
 * routes exist, the page says so plainly instead of pretending to save.
 * Nothing typed here is stored anywhere.
 */

interface KeyStatus {
  provider: "google" | "groq";
  configured: boolean;
  lastFour?: string;
}

const PROVIDERS = [
  {
    id: "google" as const,
    name: "Google AI Studio",
    role: "Primary",
    model: "Gemini 2.5 Flash",
    blurb: "Free tier, no credit card. Answers first when configured.",
  },
  {
    id: "groq" as const,
    name: "Groq",
    role: "Fallback",
    model: "Llama 3.3 70B",
    blurb: "Much larger daily request budget. Picked up when the primary fails.",
  },
];

export function SettingsView({ keys }: { keys: KeyStatus[] }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const statusFor = (id: string) =>
    keys.find((key) => key.provider === id) ?? {
      provider: id as "google" | "groq",
      configured: false,
    };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-1)]">
          Bring your own keys
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-ink-4)]">
          WADE ships with shared free-tier keys. Add your own to get your own
          quota, your own rate limits, and answers that never queue behind
          anyone else.
        </p>
      </header>

      <div
        role="note"
        className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="mt-0.5 shrink-0"
          aria-hidden
        >
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
        <p>
          <span className="font-medium">Not yet wired up.</span> The{" "}
          <code className="rounded bg-black/30 px-1 py-0.5 text-xs">
            /api/keys
          </code>{" "}
          routes do not exist yet, so nothing you type here is saved. This page
          is the finished UI waiting on that backend.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {PROVIDERS.map((provider) => {
          const status = statusFor(provider.id);
          const isRevealed = revealed[provider.id] ?? false;

          return (
            <section
              key={provider.id}
              className="rounded-2xl border border-white/10 bg-[var(--color-panel)] p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--color-ink-1)]">
                  {provider.name}
                </h2>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-4)]">
                  {provider.role}
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    status.configured
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-white/[0.06] text-[var(--color-ink-4)]"
                  }`}
                >
                  {status.configured ? "Your key" : "Shared key"}
                </span>
              </div>

              <p className="mt-1.5 text-xs text-[var(--color-ink-4)]">
                {provider.model} · {provider.blurb}
              </p>

              {status.configured && status.lastFour && (
                <p className="mt-3 text-xs text-[var(--color-ink-4)]">
                  Currently saved:{" "}
                  <span className="font-mono text-[var(--color-ink-2)]">
                    ••••••••{status.lastFour}
                  </span>
                </p>
              )}

              <div className="mt-4">
                <label
                  htmlFor={`key-${provider.id}`}
                  className="mb-1.5 block text-xs font-medium text-[var(--color-ink-3)]"
                >
                  {status.configured ? "Replace with a new key" : "Paste your API key"}
                </label>
                <div className="flex gap-2">
                  <input
                    id={`key-${provider.id}`}
                    type={isRevealed ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={drafts[provider.id] ?? ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [provider.id]: event.target.value,
                      }))
                    }
                    placeholder="Paste key…"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 font-mono text-sm text-[var(--color-ink-1)] placeholder-[var(--color-ink-5)] transition focus:border-[var(--color-brand)]/60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setRevealed((prev) => ({
                        ...prev,
                        [provider.id]: !isRevealed,
                      }))
                    }
                    aria-pressed={isRevealed}
                    aria-label={isRevealed ? "Hide key" : "Show key"}
                    className="shrink-0 rounded-xl border border-white/10 px-3 text-[var(--color-ink-4)] transition hover:bg-white/5 hover:text-white"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      {isRevealed ? (
                        <>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61M2 2l20 20" />
                        </>
                      ) : (
                        <>
                          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  title="Waiting on the /api/keys backend"
                  className="rounded-xl bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-violet)] px-3.5 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save key
                </button>
                {status.configured && (
                  <button
                    type="button"
                    disabled
                    title="Waiting on the /api/keys backend"
                    className="rounded-xl border border-white/10 px-3.5 py-2 text-xs font-medium text-[var(--color-ink-3)] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-6 rounded-2xl border border-white/10 bg-[var(--color-panel)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-ink-1)]">
          How your keys are handled
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--color-ink-4)]">
          <li className="flex gap-2">
            <span aria-hidden className="text-[var(--color-ink-5)]">•</span>
            Keys are encrypted at rest with{" "}
            <code className="rounded bg-black/30 px-1 py-0.5 text-xs">
              WADE_ENCRYPTION_KEY
            </code>{" "}
            before they touch the database.
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-[var(--color-ink-5)]">•</span>
            The server never returns a key — only the last four characters.
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-[var(--color-ink-5)]">•</span>
            Your key is used only for your own turns, and never logged.
          </li>
        </ul>
      </section>
    </div>
  );
}
