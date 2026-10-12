-- ADMIN_MAJOR_PLAN.md, Section Q follow-up: AWOL/abandonment is NOT the same
-- process as a voluntary resignation (Umali-style successive-contract cases
-- aside, this is a separate Supreme Court line — Aliten v. U-Need Lumber,
-- G.R. 168931, 2006). It cannot be auto-"deemed resigned": the employer must
-- run the twin-notice due process (return-to-work notice + chance to explain,
-- then a termination notice) before the engagement actually ends. These
-- columns track that process; "Terminated" only gets set once it's finished.
begin;

alter table public.applications
    add column if not exists awol_absence_since date,
    add column if not exists awol_notice1_sent_at timestamptz,
    add column if not exists awol_explanation_deadline date,
    add column if not exists awol_explanation_received_at timestamptz,
    add column if not exists awol_explanation_text text,
    add column if not exists termination_reason text,
    add column if not exists termination_finalized_at timestamptz,
    add column if not exists terminated_by uuid references public.admin_users(id) on delete set null;

commit;
