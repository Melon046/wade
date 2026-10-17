"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 *
 * Uses the public anon key, which is safe to ship to the browser: every table
 * is protected by Row Level Security, so the anon key can only ever read and
 * write rows that belong to the signed-in user.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
