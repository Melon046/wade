-- ===========================================================================
-- WADE — 0002: tighten message ownership
-- ---------------------------------------------------------------------------
-- Apply after 0001_init.sql, with either:
--   * Supabase Dashboard  ->  SQL Editor  ->  paste & run, or
--   * Supabase CLI        ->  supabase db push
--
-- Why this exists
--   The original `messages_insert_own` policy only checked `auth.uid() =
--   user_id`. That proves the *row* claims to belong to the caller, but not
--   that the `conversation_id` it points at does. A signed-in user could
--   therefore insert a message into someone else's conversation by supplying
--   their own `user_id` alongside a foreign `conversation_id` — writing into a
--   thread they cannot even read.
--
--   The fix makes the policy verify ownership of the parent conversation. The
--   same gap existed on UPDATE, so that is closed too, and `usage_events`
--   gets the equivalent guard for its optional `conversation_id`.
--
--   The `exists` subquery reads `public.conversations`, which is itself under
--   RLS, so it can only ever see the caller's own rows — the check is
--   self-consistent and needs no elevated privileges.
-- ===========================================================================

-- --- messages: INSERT must target a conversation the caller owns -----------
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

-- --- messages: UPDATE must keep both the row and its conversation owned ----
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

-- --- usage_events: a referenced conversation must be the caller's ----------
-- `conversation_id` is nullable (a turn can outlive its thread), so the guard
-- only applies when it is set.
drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own" on public.usage_events
  for insert with check (
    auth.uid() = user_id
    and (
      conversation_id is null
      or exists (
        select 1
        from public.conversations c
        where c.id = conversation_id
          and c.user_id = auth.uid()
      )
    )
  );
