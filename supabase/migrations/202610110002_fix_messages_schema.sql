begin;

-- The deployed `messages` table was a conversation-summary shape
-- (user_id, sender_name, last_message, ...) that does not match what the
-- admin app and the mobile app actually write (sender_id, receiver_id, body).
-- This rebuilds it as a proper 1-to-1 thread table. Existing rows cannot be
-- mapped cleanly (no sender/receiver id was ever stored), so they are dropped.

drop table if exists public.messages cascade;

create table public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    job_id TEXT,
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

alter table public.messages enable row level security;

drop policy if exists "Users can read own messages" on public.messages;
create policy "Users can read own messages" on public.messages for select using (auth.uid()::text in (sender_id, receiver_id));

drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages for insert with check (auth.uid()::text = sender_id);

drop policy if exists "Participants can mark messages read" on public.messages;
create policy "Participants can mark messages read" on public.messages for update using (auth.uid()::text = receiver_id) with check (auth.uid()::text = receiver_id);

grant all on public.messages to anon, authenticated, service_role;

commit;
