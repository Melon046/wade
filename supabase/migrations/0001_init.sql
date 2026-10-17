-- ===========================================================================
-- BATCHER — initial schema
-- ---------------------------------------------------------------------------
-- Apply with either:
--   * Supabase Dashboard  ->  SQL Editor  ->  paste & run, or
--   * Supabase CLI        ->  supabase db push
--
-- Design notes
--   * Every table is owned by a user and protected by Row Level Security, so
--     the database — not the application code — enforces tenant isolation.
--   * `usage_events` is append-only: it is the audit trail that powers the
--     cost dashboard and the per-user daily quota check.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'New chat',
  model      text not null default 'gemini-2.5-flash',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sidebar query: "my conversations, newest activity first".
create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  model           text,
  provider        text,
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz not null default now()
);

-- Thread replay: "messages in this conversation, oldest first".
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- usage_events — one row per completed assistant turn
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  message_id      uuid references public.messages (id) on delete set null,
  provider        text not null,
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  latency_ms      integer,
  fallback_used   boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Quota check: "how many tokens did this user burn today?"
create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_touch_updated_at on public.conversations;
create trigger conversations_touch_updated_at
  before update on public.conversations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.usage_events  enable row level security;

-- --- conversations ---------------------------------------------------------
drop policy if exists "conversations_select_own" on public.conversations;
create policy "conversations_select_own" on public.conversations
  for select using (auth.uid() = user_id);

drop policy if exists "conversations_insert_own" on public.conversations;
create policy "conversations_insert_own" on public.conversations
  for insert with check (auth.uid() = user_id);

drop policy if exists "conversations_update_own" on public.conversations;
create policy "conversations_update_own" on public.conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "conversations_delete_own" on public.conversations;
create policy "conversations_delete_own" on public.conversations
  for delete using (auth.uid() = user_id);

-- --- messages --------------------------------------------------------------
drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own" on public.messages
  for select using (auth.uid() = user_id);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete using (auth.uid() = user_id);

-- --- usage_events (append-only: read + insert, never update/delete) --------
drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own" on public.usage_events
  for select using (auth.uid() = user_id);

drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own" on public.usage_events
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Convenience view: today's token spend per user (used by the quota guard)
-- ---------------------------------------------------------------------------
create or replace view public.usage_today
with (security_invoker = true) as
select
  user_id,
  count(*)                        as turns,
  coalesce(sum(input_tokens), 0)  as input_tokens,
  coalesce(sum(output_tokens), 0) as output_tokens
from public.usage_events
where created_at >= date_trunc('day', now())
group by user_id;
