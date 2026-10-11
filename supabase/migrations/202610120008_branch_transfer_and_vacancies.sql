begin;

-- Branch-transfer consent: HR can offer to move an application to a different
-- branch (e.g. a branch manager claims it), but the move only takes effect
-- once the applicant accepts — mirrors how MR.DIY's real process works,
-- where the applicant states/agrees to a preferred store.

alter table public.applications
    add column if not exists transfer_offer_branch_id uuid references public.branches(id) on delete set null,
    add column if not exists transfer_offer_admin_id uuid references public.admin_users(id) on delete set null,
    add column if not exists transfer_status text not null default 'none', -- 'none' | 'pending' | 'accepted' | 'declined'
    add column if not exists transfer_responded_at timestamptz;

-- The applicant may only flip a pending offer to accepted/declined — never
-- originate an offer or touch any other column.
drop policy if exists "Applicants respond to branch transfer offers" on public.applications;
create policy "Applicants respond to branch transfer offers" on public.applications
    for update to authenticated
    using (auth.uid()::text = user_id and transfer_status = 'pending')
    with check (auth.uid()::text = user_id and transfer_status in ('accepted', 'declined'));

revoke update on public.applications from authenticated;
grant update (transfer_status, transfer_responded_at) on public.applications to authenticated;

-- When accepted, actually move the application to the offered branch/admin.
-- When declined, just clear the offer and leave the application where it was.
create or replace function public.apply_branch_transfer_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.transfer_status = 'accepted' and old.transfer_status = 'pending' then
        new.branch_id := new.transfer_offer_branch_id;
        new.assigned_to := new.transfer_offer_admin_id;
    end if;

    insert into public.application_events (application_id, type, detail)
    values (
        new.id,
        'transfer_response',
        case when new.transfer_status = 'accepted' then 'Applicant accepted the branch transfer.'
             else 'Applicant declined the branch transfer.' end
    );

    if new.transfer_offer_admin_id is not null then
        insert into public.admin_alerts (admin_id, type, title, message, application_id)
        values (
            new.transfer_offer_admin_id,
            'TRANSFER_RESPONSE',
            case when new.transfer_status = 'accepted' then 'Applicant accepted transfer' else 'Applicant declined transfer' end,
            case when new.transfer_status = 'accepted'
                 then 'The applicant agreed to be considered for your branch.'
                 else 'The applicant declined to transfer to your branch.' end,
            new.id
        );
    end if;

    return new;
end;
$$;

drop trigger if exists applications_transfer_response on public.applications;
create trigger applications_transfer_response
    before update on public.applications
    for each row
    when (old.transfer_status is distinct from new.transfer_status and new.transfer_status in ('accepted', 'declined'))
    execute function public.apply_branch_transfer_response();

-- ──────────────────────────────────────────────────────────────────────────
-- Visible vacancy count: jobs.hired_count, kept in sync by a trigger so the
-- app can show "X openings left" (= openings - hired_count) by reading the
-- jobs row directly — no cross-table read needed, so it works under the
-- existing "published jobs are public" policy.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.jobs
    add column if not exists hired_count integer not null default 0;

create or replace function public.sync_job_hired_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    affected_job_id text;
begin
    affected_job_id := coalesce(new.job_id, old.job_id);

    update public.jobs
    set hired_count = (
        select count(*) from public.applications
        where job_id = affected_job_id and status = 'Hired'
    )
    where id = affected_job_id;

    return coalesce(new, old);
end;
$$;

drop trigger if exists applications_sync_hired_count on public.applications;
create trigger applications_sync_hired_count
    after insert or update of status or delete on public.applications
    for each row execute function public.sync_job_hired_count();

-- Backfill existing jobs once.
update public.jobs j
set hired_count = (
    select count(*) from public.applications a where a.job_id = j.id and a.status = 'Hired'
);

commit;
