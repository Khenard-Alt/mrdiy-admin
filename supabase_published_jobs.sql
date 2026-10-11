-- Run on the SAME Supabase project used by the admin and Android app.
-- This grants read access to published jobs; it does not grant job write access.
-- Existing admin policies are preserved. Review any other SELECT policies:
-- permissive policies are combined with OR by PostgreSQL.
begin;

alter table public.jobs enable row level security;
grant select on public.jobs to anon, authenticated;

drop policy if exists "Applicants can read published jobs" on public.jobs;
create policy "Applicants can read published jobs"
    on public.jobs for select to anon, authenticated
    using (status = 'published');

commit;

-- Diagnostic checks (no applicant data):
select status, count(*) from public.jobs group by status;
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('jobs', 'applications', 'saved_jobs');
