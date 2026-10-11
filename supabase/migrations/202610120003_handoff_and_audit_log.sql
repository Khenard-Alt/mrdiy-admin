begin;

-- ADMIN_MAJOR_PLAN.md, Section B (hand-off/assignment) and Section J (audit log).

-- 1. Who currently owns an application, and which branch it belongs to.
alter table public.applications
    add column if not exists assigned_to uuid references public.admin_users(id) on delete set null,
    add column if not exists branch_id uuid references public.branches(id) on delete set null;

create index if not exists applications_assigned_to_idx on public.applications (assigned_to);
create index if not exists applications_branch_id_idx on public.applications (branch_id);

-- 2. Audit log: every status change, hand-off and note, in order.
create table if not exists public.application_events (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null references public.applications(id) on delete cascade,
    actor_id uuid references public.admin_users(id) on delete set null,
    type text not null, -- 'status' | 'claim' | 'assign' | 'return' | 'escalate' | 'note'
    detail text,
    created_at timestamptz not null default now()
);

create index if not exists application_events_application_id_idx
    on public.application_events (application_id, created_at);

alter table public.application_events enable row level security;
drop policy if exists "No direct client access to application_events" on public.application_events;
-- Server only (service role bypasses RLS); no policy means anon/authenticated get nothing.

-- 3. Auto-route a new application to the branch matching its job's location,
-- best-effort by exact text match (jobs don't have branch_id yet — Section F).
create or replace function public.route_application_to_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    job_location text;
    matched_branch uuid;
begin
    select location into job_location from public.jobs where id::text = new.job_id::text;
    if job_location is not null then
        select id into matched_branch from public.branches where location = job_location limit 1;
        new.branch_id := matched_branch;
    end if;
    return new;
end;
$$;

drop trigger if exists applications_route_branch on public.applications;
create trigger applications_route_branch
    before insert on public.applications
    for each row execute function public.route_application_to_branch();

commit;
