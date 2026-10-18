import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { SettingsView } from "@/components/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // The /api/keys backend does not exist yet, so there is nothing to read.
  // The view renders its own "not wired up" notice rather than a broken form.
  const keys: {
    provider: "google" | "groq";
    configured: boolean;
    lastFour?: string;
  }[] = [];

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)]">
      <AppHeader />
      <main>
        <SettingsView keys={keys} />
      </main>
    </div>
  );
}
