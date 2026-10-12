-- ADMIN_MAJOR_PLAN.md, Section Q follow-up: last_working_day is the PLANNED end
-- of the 30-day notice period, but an employee can stop reporting earlier
-- ("incomplete notice" / AWOL during notice). actual_last_day records the real
-- last day worked once HR confirms it, separate from the plan. The final-pay
-- 30-day deadline (DOLE Labor Advisory 06-20) must run from the real last day
-- once known — using the unfulfilled planned date would understate how overdue
-- the pay actually is.
begin;

alter table public.applications
    add column if not exists actual_last_day date;

commit;
