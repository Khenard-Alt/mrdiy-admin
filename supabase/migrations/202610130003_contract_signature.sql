-- ADMIN_MAJOR_PLAN.md, Section P: the Branch Manager countersigns a Contractual
-- hire's employment contract on the admin web (canvas signature pad, not a USB
-- hardware pad — see Section P for why). Required before the Hired process is
-- considered complete for a job that has a contract duration.
begin;

alter table public.applications
    add column if not exists manager_signature_url text,
    add column if not exists manager_signed_at timestamptz,
    add column if not exists manager_signed_by uuid references public.admin_users(id) on delete set null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-signatures', 'contract-signatures', false, 1048576, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = 1048576,
    allowed_mime_types = array['image/png'];

-- Server only (service role bypasses RLS) — the admin API is the only writer/reader.

commit;
