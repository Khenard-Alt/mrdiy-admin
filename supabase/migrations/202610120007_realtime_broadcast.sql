begin;

-- Live updates for the admin dashboard, without exposing row data over the
-- client-side anon key (the admin doesn't use Supabase Auth, so RLS-gated
-- postgres_changes isn't an option here). Each trigger sends only a tiny
-- "something changed on this table" signal via Realtime Broadcast; the
-- browser reacts by refetching through the normal authenticated /api routes.

create or replace function public.broadcast_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    perform realtime.send(
        jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP),
        TG_TABLE_NAME,
        'admin-updates',
        false
    );
    return coalesce(new, old);
end;
$$;

drop trigger if exists broadcast_applications_change on public.applications;
create trigger broadcast_applications_change
    after insert or update or delete on public.applications
    for each row execute function public.broadcast_table_change();

drop trigger if exists broadcast_jobs_change on public.jobs;
create trigger broadcast_jobs_change
    after insert or update or delete on public.jobs
    for each row execute function public.broadcast_table_change();

drop trigger if exists broadcast_messages_change on public.messages;
create trigger broadcast_messages_change
    after insert on public.messages
    for each row execute function public.broadcast_table_change();

drop trigger if exists broadcast_admin_alerts_change on public.admin_alerts;
create trigger broadcast_admin_alerts_change
    after insert on public.admin_alerts
    for each row execute function public.broadcast_table_change();

commit;
