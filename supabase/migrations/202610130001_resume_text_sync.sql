-- The Android app's match scoring (JobMatchingEngine, canShowMatch) needs the
-- resume's extracted plain text, but the mobile code only ever cached it in local
-- SharedPreferences — never wrote it to Supabase. A reinstall or cleared app data
-- wiped it permanently, even though resume_url still pointed at a real uploaded
-- file, so match scores silently disappeared with no way to recover without
-- re-uploading the resume. This column lets the app round-trip it through the
-- backend like every other profile field.
begin;

alter table public.profiles
    add column if not exists resume_text text;

commit;
