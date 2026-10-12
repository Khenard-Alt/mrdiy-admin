begin;

-- ADMIN_MAJOR_PLAN.md, Section N: contract-based employment (4-6 month minimum-wage
-- roles). A Contractual job can declare its duration; once an applicant for it is
-- Hired, the application gets a computed start/end date so HR can see when the
-- contract ends and get reminded ahead of time.

alter table public.jobs
    add column if not exists contract_duration_months integer;

alter table public.applications
    add column if not exists contract_start_date date,
    add column if not exists contract_end_date date;

commit;
