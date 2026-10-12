-- ADMIN_MAJOR_PLAN.md, Section Q: resignation (voluntary exit), separate from
-- "Contract Ended" (fixed-term contract completion). Philippine Labor Code
-- (Article 300) default notice is 30 days — last_working_day defaults to
-- resignation_date + 30, editable by HR/branch manager if a shorter notice
-- was accepted (a waiver, not a legal requirement to shorten it).
begin;

alter table public.applications
    add column if not exists resignation_date date,
    add column if not exists last_working_day date,
    add column if not exists clearance_completed_at timestamptz,
    add column if not exists final_pay_released_at timestamptz;

-- Exit checklist: company property returned before clearance is complete.
-- Mirrors public.pre_employment_requirements (entry checklist), but for exit.
create table if not exists public.exit_checklist (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null references public.applications(id) on delete cascade,
    user_id text not null,
    item_name text not null,
    status text not null default 'Pending' check (status in ('Pending', 'Returned', 'Verified', 'Missing')),
    remarks text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (application_id, item_name)
);
create index if not exists exit_checklist_application_id_idx on public.exit_checklist (application_id);

alter table public.exit_checklist enable row level security;
-- Server only (service role bypasses RLS); admin web manages this, not the applicant directly.

-- Compliance safety net: final pay must be released within 30 days of the last
-- working day (DOLE Labor Advisory 06-20). Flag it for HR instead of letting a
-- legal deadline slip unnoticed — checked lazily on each applications list load,
-- same pattern as the contract-ending-soon and job auto-close checks.

commit;
