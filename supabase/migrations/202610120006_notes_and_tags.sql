begin;

-- ADMIN_MAJOR_PLAN.md, Section E: internal notes (not visible to the applicant) and tags.

create table if not exists public.application_notes (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null references public.applications(id) on delete cascade,
    author_id uuid references public.admin_users(id) on delete set null,
    body text not null,
    created_at timestamptz not null default now()
);

create index if not exists application_notes_application_id_idx
    on public.application_notes (application_id, created_at);

alter table public.application_notes enable row level security;
-- Server only (service role bypasses RLS); never exposed to the applicant.

alter table public.applications
    add column if not exists tags text[] not null default '{}';

commit;
