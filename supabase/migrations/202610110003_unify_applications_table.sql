begin;

-- This project accumulated two parallel application tables from separate
-- setup scripts: `applications` (richer schema, what the admin dashboard
-- reads) and `job_applications` (what the Android app actually wrote to).
-- As a result, every application submitted from the app was invisible in
-- the admin dashboard. This unifies everything onto `applications`.

-- 1. Bring `applications` up to what the admin UI expects.
alter table public.applications
    add column if not exists updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    add column if not exists match_score NUMERIC,
    add column if not exists resume_url TEXT;

-- 2. Copy over any rows that only exist in the legacy job_applications table,
--    and retire it. Guarded because some projects never created that table.
do $$
begin
    if to_regclass('public.job_applications') is not null then
        insert into public.applications (user_id, job_id, job_title, status, created_at, applied_at)
        select ja.user_id, ja.job_id, ja.job_title, ja.status, ja.applied_at, ja.applied_at
        from public.job_applications ja
        where not exists (
            select 1 from public.applications a
            where a.user_id = ja.user_id and a.job_id = ja.job_id
        )
        on conflict (user_id, job_id) do nothing;

        drop table public.job_applications cascade;
    end if;
end $$;

commit;
