/**
 * Context window construction.
 *
 * The bug this replaces: the route fetched the *oldest* 200 messages
 * (`order created_at ascending` + `limit 200`) and then took `.slice(-20)` of
 * that page. Once a conversation passed 200 messages the page never contained
 * the recent turns, so the model was fed a window that stopped 200 messages in
 * the past — the user's newest question was not even in it.
 *
 * The fix is to ask the database for the newest N rows (`descending` +
 * `limit N`) and reverse them into chronological order for the model.
 */

import type { ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

/** How many prior messages to replay as context. */
export const MAX_CONTEXT_MESSAGES = 20;

interface HistoryRow {
  role: string;
  content: string;
}

/**
 * Fetch the most recent `limit` messages of a conversation, oldest-first.
 *
 * Ordering is done in the database, not in memory: `descending` + `limit`
 * returns the newest rows, and the reverse puts them back into the order the
 * model expects. The `id` tiebreaker keeps the order stable when two rows share
 * a `created_at` (which happens when a user message and an assistant reply are
 * written in the same millisecond).
 */
export async function loadContextMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit: number = MAX_CONTEXT_MESSAGES,
): Promise<ModelMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load conversation history: ${error.message}`);
  }

  return (data ?? [])
    .slice()
    .reverse()
    .map((row: HistoryRow) => ({
      role: row.role as "user" | "assistant" | "system",
      content: row.content,
    }));
}
