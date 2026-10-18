"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;

    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      // The raw Supabase message can name internal endpoints and rate-limit
      // internals. Log it, show the user a plain sentence.
      console.error("[wade] sign-in failed", error);
      setStatus("error");
      setMessage(
        "We couldn't send the sign-in link. Check the address and try again in a moment.",
      );
      return;
    }

    setStatus("sent");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-violet)] text-2xl font-bold text-white shadow-lg shadow-indigo-500/20">
            W
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-ink-1)]">
            WADE
          </h1>
          <p className="mt-2 text-sm text-[var(--color-ink-4)]">
            Your own AI assistant. Sign in with a magic link — no password to
            remember.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur">
          {status === "sent" ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                ✓
              </div>
              <h2 className="text-base font-medium text-[var(--color-ink-1)]">
                Check your inbox
              </h2>
              <p className="mt-2 text-sm text-[var(--color-ink-4)]">
                We sent a sign-in link to{" "}
                <span className="font-medium text-[var(--color-ink-2)]">
                  {email}
                </span>
                . Open it on this device to finish signing in.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setMessage("");
                }}
                className="mt-5 text-sm text-indigo-400 underline-offset-4 hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-[var(--color-ink-3)]"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  aria-invalid={status === "error" || undefined}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--color-ink-1)] placeholder-[var(--color-ink-5)] transition focus:border-[var(--color-brand)]/60"
                />
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full rounded-xl bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-violet)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "sending" ? "Sending link…" : "Send magic link"}
              </button>

              {status === "error" && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                >
                  {message}
                </p>
              )}
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-ink-5)]">
          Free to run. Your conversations are private to your account.
        </p>
      </div>
    </main>
  );
}
