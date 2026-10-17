import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for Route Handlers and Server Components.
 *
 * Reads the session from the request cookies, so queries run *as the signed-in
 * user* and Row Level Security applies. This is the client the chat API uses —
 * it never needs the service-role key.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session instead, so this is safe
            // to ignore.
          }
        },
      },
    },
  );
}
