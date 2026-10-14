begin;

-- ADMIN_MAJOR_PLAN.md: "clearance cleared"/"resignation recorded"/every status-change
-- notification tapped by the applicant only ever opened the generic Applications list,
-- never the specific application — public.alerts never had an application_id to deep-link
-- with (unlike public.admin_alerts, the HR-facing table, which already had one).

alter table public.alerts
    add column if not exists application_id uuid references public.applications(id) on delete set null;

create index if not exists alerts_application_id_idx on public.alerts (application_id);

-- The "Application received" trigger already has the new row — give it its own id too.
create or replace function public.notify_application_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    job_title text;
begin
    select title into job_title from public.jobs where id::text = new.job_id::text;

    insert into public.alerts (user_id, type, title, message, job_id, application_id)
    values (
        new.user_id::text,
        'APPLICATION_UPDATE',
        'Application received',
        'We received your application for ' || coalesce(job_title, 'this job') || '. We will update you here once it is reviewed.',
        new.job_id::text,
        new.id
    );
    return new;
end;
$$;

commit;
