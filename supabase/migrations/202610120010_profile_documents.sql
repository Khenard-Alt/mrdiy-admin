-- Profile-level documents: a Valid ID (with signature) and the same pre-employment
-- document types, but tied to the applicant's PROFILE (user_id) instead of a single
-- application. All optional/nullable — the applicant can upload any time starting
-- from their profile, before applying to any job. Not required to submit an
-- application (not a gate); HR reviews and verifies whatever has been uploaded so
-- far right in the application review panel, regardless of the application's stage.
--
-- This is separate from public.pre_employment_requirements, which stays as the
-- per-application checklist created once an applicant is Hired for a specific job.
begin;

create table if not exists public.applicant_documents (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    document_name text not null,
    status text not null default 'Pending' check (status in ('Pending', 'Uploaded', 'Verified', 'Rejected')),
    document_url text,
    remarks text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, document_name)
);
create index if not exists applicant_documents_user_idx on public.applicant_documents (user_id);

alter table public.applicant_documents enable row level security;

drop policy if exists "Applicants read own documents" on public.applicant_documents;
create policy "Applicants read own documents" on public.applicant_documents
    for select to authenticated using (auth.uid()::text = user_id);

drop policy if exists "Applicants upsert own documents" on public.applicant_documents;
create policy "Applicants upsert own documents" on public.applicant_documents
    for insert to authenticated with check (auth.uid()::text = user_id);

-- A verified document is locked; the applicant may (re)upload while it is Pending, Uploaded or Rejected.
drop policy if exists "Applicants update own documents" on public.applicant_documents;
create policy "Applicants update own documents" on public.applicant_documents
    for update to authenticated
    using (auth.uid()::text = user_id and status in ('Pending', 'Uploaded', 'Rejected'))
    with check (auth.uid()::text = user_id and status in ('Pending', 'Uploaded'));

revoke update on public.applicant_documents from authenticated;
grant update (document_url, status, updated_at) on public.applicant_documents to authenticated;

-- ------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applicant-documents', 'applicant-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists "applicant_documents_owner" on storage.objects;
create policy "applicant_documents_owner" on storage.objects for all to authenticated
using (bucket_id = 'applicant-documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'applicant-documents' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
