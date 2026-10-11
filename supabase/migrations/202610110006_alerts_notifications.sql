-- Per-user notifications (public.alerts).
-- Reason: notifications must be saved per user, shown with a real time, and be marked read by the owner.
-- Who writes: the admin server (service role) for new jobs, status updates and messages, plus the
-- trigger below for "application received". Applicants can only read, mark read, and delete their own.
-- Verification: select user_id, type, title, created_at, is_read from public.alerts order by created_at desc limit 10;
begin;

alter table public.alerts
    add column if not exists created_at timestamptz not null default now();

create index if not exists alerts_user_created_idx on public.alerts (user_id, created_at desc);

alter table public.alerts enable row level security;

drop policy if exists "Users can read own alerts" on public.alerts;
create policy "Users can read own alerts" on public.alerts
    for select to authenticated using (auth.uid()::text = user_id);

drop policy if exists "Users can update own alerts" on public.alerts;
create policy "Users can update own alerts" on public.alerts
    for update to authenticated
    using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "Users can delete own alerts" on public.alerts;
create policy "Users can delete own alerts" on public.alerts
    for delete to authenticated using (auth.uid()::text = user_id);

-- Applicants may change only is_read; everything else is written by the server.
revoke update on public.alerts from authenticated;
grant update (is_read) on public.alerts to authenticated;

-- "Application received" notification, created in the database so it cannot be forged by the client.
create or replace function public.notify_application_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    job_title text;
begin
    select title into job_title from public.jobs where id::text = new.job_id::text;

    insert into public.alerts (user_id, type, title, message, job_id)
    values (
        new.user_id::text,
        'APPLICATION_UPDATE',
        'Application received',
        'We received your application for ' || coalesce(job_title, 'this job') || '. We will update you here once it is reviewed.',
        new.job_id::text
    );
    return new;
end;
$$;

drop trigger if exists applications_notify_received on public.applications;
create trigger applications_notify_received
    after insert on public.applications
    for each row execute function public.notify_application_received();

commit;
