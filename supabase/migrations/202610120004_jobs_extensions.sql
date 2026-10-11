begin;

-- ADMIN_MAJOR_PLAN.md, Section F: openings, deadline, branch for jobs.
-- Auto-close (full or past deadline) is applied lazily by the admin's
-- GET /api/jobs (no pg_cron dependency needed for a capstone deployment).

alter table public.jobs
    add column if not exists openings integer,
    add column if not exists deadline date,
    add column if not exists branch_id uuid references public.branches(id) on delete set null;

create index if not exists jobs_branch_id_idx on public.jobs (branch_id);

commit;
