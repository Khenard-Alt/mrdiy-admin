-- The auto-routing trigger (202610120003) only matched a new application's
-- branch by exact text equality between jobs.location and branches.location.
-- A new branch created later with slightly different spelling/punctuation in
-- that free-text field would silently fail to match: the application's
-- branch_id stays null, it becomes invisible to every branch manager (their
-- view is always scoped to their own branch_id), and nothing told HR it
-- needed a manual assign. jobs.branch_id (added in 202610120004) already
-- exists and is more reliable than text matching, so use it first.
begin;

create or replace function public.route_application_to_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    job_branch_id uuid;
    job_location text;
    matched_branch uuid;
begin
    select branch_id, location into job_branch_id, job_location
    from public.jobs where id::text = new.job_id::text;

    if job_branch_id is not null then
        new.branch_id := job_branch_id;
    elsif job_location is not null then
        select id into matched_branch from public.branches where location = job_location limit 1;
        new.branch_id := matched_branch;
    end if;

    return new;
end;
$$;

-- Safety net: if routing still couldn't place the application anywhere
-- (job has no branch_id and no location text-match), tell HR instead of
-- letting it sit invisible to every branch manager with no explanation.
create or replace function public.alert_unrouted_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    job_title text;
    applicant_name text;
begin
    if new.branch_id is not null then
        return new;
    end if;

    select title into job_title from public.jobs where id::text = new.job_id::text;
    select full_name into applicant_name from public.profiles where user_id = new.user_id;

    insert into public.admin_alerts (admin_id, type, title, message, application_id)
    select
        id,
        'UNROUTED_APPLICATION',
        'Application needs manual branch assignment',
        coalesce(applicant_name, 'An applicant') || ' applied for ' || coalesce(job_title, 'a job') ||
            ', but it could not be auto-routed to a branch. Please assign it manually.',
        new.id
    from public.admin_users
    where is_active = true and role in ('super_admin', 'hr_officer');

    return new;
end;
$$;

drop trigger if exists applications_alert_unrouted on public.applications;
create trigger applications_alert_unrouted
    after insert on public.applications
    for each row execute function public.alert_unrouted_application();

commit;
