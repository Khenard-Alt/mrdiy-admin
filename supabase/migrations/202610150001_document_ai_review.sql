-- §6.2 Document verification AI: an advisory-only Gemini Vision check HR can run on
-- an uploaded document. Never auto-verifies/auto-rejects anything — this just stores
-- the last AI check's result (verdict + when) so it can be shown next to the existing
-- manual Verify/Send-back buttons. Nullable, non-destructive on both tables.

alter table public.applicant_documents
  add column if not exists ai_review jsonb;

alter table public.pre_employment_requirements
  add column if not exists ai_review jsonb;
