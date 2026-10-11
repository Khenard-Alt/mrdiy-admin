begin;

-- ADMIN_MAJOR_PLAN.md, Section A: roles + branches (Yugto 1).
-- Three roles: super_admin (manages accounts/branches/settings),
-- hr_officer (screens all applicants, can hand off to a branch),
-- branch_manager (sees only their branch's applicants, does interviews).

-- 1. Branches table.
create table if not exists public.branches (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    location text,
    manager_id uuid references public.admin_users(id) on delete set null,
    created_at timestamptz not null default now()
);

-- 2. Extend admin_users with role/branch/contact/active-state.
alter table public.admin_users
    add column if not exists email text,
    add column if not exists branch_id uuid references public.branches(id) on delete set null,
    add column if not exists is_active boolean not null default true;

-- The existing default admin row becomes the super admin so it keeps full access.
update public.admin_users set role = 'super_admin' where username = 'admin' and role = 'admin';

-- Normalize the role column going forward (no longer just a free "admin" string).
alter table public.admin_users alter column role set default 'hr_officer';

-- 3. Seed a starter branch list from existing job locations, so there's something
-- to assign accounts/jobs to immediately instead of starting from an empty list.
insert into public.branches (name, location)
select distinct location, location
from public.jobs
where location is not null and trim(location) <> ''
on conflict do nothing;

-- 4. RLS: keep admin_users readable only server-side (service role bypasses RLS anyway;
-- this just removes the permissive "true" policy from the original setup script).
drop policy if exists "Allow read access to admin_users" on public.admin_users;

alter table public.branches enable row level security;
drop policy if exists "Admins can view branches" on public.branches;
create policy "Admins can view branches" on public.branches for select using (true);

commit;
