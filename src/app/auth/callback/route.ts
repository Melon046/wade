import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link callback.
 *
 * Supabase redirects the user here after they click the emailed link. We
 * exchange the one-time `code` for a real session (which sets the auth cookies)
 * and then send the user on to the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/chat";

  // Only allow same-site redirects, so a crafted link cannot bounce the user
  // to an attacker-controlled domain after login.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/chat";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
