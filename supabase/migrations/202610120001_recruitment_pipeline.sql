-- Recruitment pipeline: interviews, pre-employment requirements (documents), and their storage.
-- Answers the capstone panel comments about the steps from applying until employment.
--   public.interviews                     interview schedule set by HR; the applicant confirms or declines.
--   public.pre_employment_requirements    document checklist created when an applicant is Hired.
--   storage bucket `requirements`         the applicant's uploaded documents (private; own folder only).
-- Writes by HR happen through the admin server (service role). Applicants can only:
--   * read their own rows,
--   * answer an interview (applicant_response, responded_at),
--   * upload a document for their own requirement (document_url, status Pending/Uploaded).
-- Verification:
--   select * from public.interviews;
--   select * from public.pre_employment_requirements order by created_at desc;
--   select id, public, file_size_limit from storage.buckets where id = 'requirements';
begin;

-- ---------------------------------------------------------------- interviews
create table if not exists public.interviews (
    id uuid primary key default gen_random_uuid(),
    application_id text not null,
    user_id text not null,
    job_id text,
    scheduled_at timestamptz not null,
    venue text not null,
    mode text not null default 'in_person' check (mode in ('in_person', 'online')),
    meeting_link text,
    notes text,
    status text not null default 'Scheduled' check (status in ('Scheduled', 'Rescheduled', 'Cancelled', 'Completed')),
    applicant_response text not null default 'Pending' check (applicant_response in ('Pending', 'Confirmed', 'Declined')),
    responded_at timestamptz,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists interviews_user_idx on public.interviews (user_id, scheduled_at desc);
create index if not exists interviews_application_idx on public.interviews (application_id, created_at desc);

alter table public.interviews enable row level security;

drop policy if exists "Applicants read own interviews" on public.interviews;
create policy "Applicants read own interviews" on public.interviews
    for select to authenticated using (auth.uid()::text = user_id);

drop policy if exists "Applicants answer own interviews" on public.interviews;
create policy "Applicants answer own interviews" on public.interviews
    for update to authenticated
    using (auth.uid()::text = user_id and status in ('Scheduled', 'Rescheduled'))
    with check (auth.uid()::text = user_id and applicant_response in ('Confirmed', 'Declined'));

revoke update on public.interviews from authenticated;
grant update (applicant_response, responded_at) on public.interviews to authenticated;

-- ------------------------------------------- pre-employment requirements
create table if not exists public.pre_employment_requirements (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    application_id text not null,
    requirement_name text not null,
    status text not null default 'Pending' check (status in ('Pending', 'Uploaded', 'Verified', 'Rejected')),
    document_url text,
    remarks text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (application_id, requirement_name)
);
create index if not exists requirements_user_idx on public.pre_employment_requirements (user_id);

alter table public.pre_employment_requirements enable row level security;

drop policy if exists "Applicants read own requirements" on public.pre_employment_requirements;
create policy "Applicants read own requirements" on public.pre_employment_requirements
    for select to authenticated using (auth.uid()::text = user_id);

-- A verified document is locked; the applicant may (re)upload while it is Pending, Uploaded or Rejected.
drop policy if exists "Applicants upload own requirements" on public.pre_employment_requirements;
create policy "Applicants upload own requirements" on public.pre_employment_requirements
    for update to authenticated
    using (auth.uid()::text = user_id and status in ('Pending', 'Uploaded', 'Rejected'))
    with check (auth.uid()::text = user_id and status in ('Pending', 'Uploaded'));

revoke update on public.pre_employment_requirements from authenticated;
grant update (document_url, status, updated_at) on public.pre_employment_requirements to authenticated;

-- ------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('requirements', 'requirements', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists "requirements_owner" on storage.objects;
create policy "requirements_owner" on storage.objects for all to authenticated
using (bucket_id = 'requirements' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'requirements' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
