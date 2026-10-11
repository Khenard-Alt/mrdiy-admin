begin;

-- ADMIN_MAJOR_PLAN.md, Section H: notifications for HR/admins themselves
-- (new application, applicant's reply, hand-off received, interview confirmed/declined).

create table if not exists public.admin_alerts (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid references public.admin_users(id) on delete cascade,
    type text not null,
    title text not null,
    message text not null,
    application_id uuid references public.applications(id) on delete cascade,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists admin_alerts_admin_id_idx on public.admin_alerts (admin_id, created_at desc);

alter table public.admin_alerts enable row level security;
-- Server only (service role bypasses RLS); no client-facing policy.

-- Tell every active HR officer/super admin about a new application (a branch
-- manager only hears about it once it's routed/assigned to their branch).
create or replace function public.notify_admins_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    job_title text;
    applicant_name text;
begin
    select title into job_title from public.jobs where id::text = new.job_id::text;
    select full_name into applicant_name from public.profiles where user_id = new.user_id;

    insert into public.admin_alerts (admin_id, type, title, message, application_id)
    select
        id,
        'NEW_APPLICATION',
        'New application',
        coalesce(applicant_name, 'An applicant') || ' applied for ' || coalesce(job_title, 'a job') || '.',
        new.id
    from public.admin_users
    where is_active = true and role in ('super_admin', 'hr_officer');

    return new;
end;
$$;

drop trigger if exists applications_notify_admins on public.applications;
create trigger applications_notify_admins
    after insert on public.applications
    for each row execute function public.notify_admins_new_application();

commit;
