-- ==========================================================================
-- COMPLETE 1-CLICK FRESH SUPABASE SETUP SCRIPT for MrDIY Careers
--
-- Run this SINGLE script in your new Supabase SQL Editor:
-- Supabase Dashboard → SQL Editor → New Query → Paste → RUN
-- ==========================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. CREATE ALL TABLES
-- ──────────────────────────────────────────────────────────────────────────

-- Branches Table (a branch's HR officers/manager + the jobs posted there)
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT,
    manager_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedicated Admin Users Table (Username-Based Authentication)
-- role: 'super_admin' (manages accounts/branches), 'hr_officer' (screens all
-- applicants), or 'branch_manager' (sees only their own branch's applicants).
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    full_name TEXT DEFAULT 'HR Administrator',
    role TEXT DEFAULT 'hr_officer',
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.branches
    ADD CONSTRAINT branches_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.admin_users(id) ON DELETE SET NULL;

-- Insert Default Admin Account (Username: admin, Password: admin123)
INSERT INTO public.admin_users (username, password, full_name, role)
VALUES ('admin', 'admin123', 'MR.D.I.Y. HR Administrator', 'super_admin')
ON CONFLICT (username) DO NOTHING;

-- Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id TEXT PRIMARY KEY,
    full_name TEXT,
    location TEXT,
    desired_position TEXT,
    years_experience TEXT,
    email TEXT,
    phone TEXT,
    about TEXT,
    skills TEXT,
    headline TEXT,
    photo_path TEXT,
    work_experiences JSONB DEFAULT '[]'::jsonb,
    education JSONB DEFAULT '[]'::jsonb,
    resume_url TEXT,
    resume_name TEXT,
    resume_uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs Table
CREATE TABLE IF NOT EXISTS public.jobs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT,
    description TEXT,
    location TEXT,
    salary TEXT,
    salary_type TEXT DEFAULT 'monthly',
    status TEXT DEFAULT 'published',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    job_type TEXT DEFAULT 'Not specified',
    category TEXT DEFAULT 'Not specified',
    level TEXT DEFAULT 'Not specified',
    openings INTEGER,
    deadline DATE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL
);

-- Applications Table
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    job_title TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    match_score NUMERIC,
    resume_url TEXT,
    assigned_to UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    UNIQUE (user_id, job_id)
);

-- Internal notes (never visible to the applicant).
CREATE TABLE IF NOT EXISTS public.application_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log: every status change, hand-off and note, in order.
CREATE TABLE IF NOT EXISTS public.application_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    type TEXT NOT NULL, -- 'status' | 'claim' | 'assign' | 'return' | 'escalate' | 'note'
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saved Jobs Table
CREATE TABLE IF NOT EXISTS public.saved_jobs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, job_id)
);

-- Alerts Table
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'JOB_MATCH',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    time_ago TEXT NOT NULL DEFAULT 'Just now',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    job_id TEXT
);

-- Messages Table (1-to-1 thread between an admin and an applicant)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    job_id TEXT,
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. CREATE RESUMES STORAGE BUCKET
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'resumes',
    'resumes',
    false,
    10485760, -- 10 MB limit
    '{application/pdf,text/plain}'
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_notes ENABLE ROW LEVEL SECURITY;
-- No client-facing policy on application_notes: server only (service role).
-- No client-facing policy on application_events: server only (service role).
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. APPLY ROW LEVEL SECURITY POLICIES
-- ──────────────────────────────────────────────────────────────────────────

-- Admin Users Policies
-- No client-facing policy: admin_users is only ever read/written by the
-- Next.js server (service-role key, which bypasses RLS entirely). With RLS
-- enabled and no policy, anon/authenticated clients get zero access.
DROP POLICY IF EXISTS "Allow read access to admin_users" ON public.admin_users;

-- Branches Policies (read-only reference data for the admin UI)
DROP POLICY IF EXISTS "Admins can view branches" ON public.branches;
CREATE POLICY "Admins can view branches" ON public.branches FOR SELECT USING (true);

-- Profiles Policies
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid()::text = user_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile" ON public.profiles FOR DELETE USING (auth.uid()::text = user_id);

-- Jobs Policies
DROP POLICY IF EXISTS "Applicants can read published jobs" ON public.jobs;
CREATE POLICY "Applicants can read published jobs" ON public.jobs FOR SELECT TO anon, authenticated USING (status = 'published');

DROP POLICY IF EXISTS "Admins can manage jobs" ON public.jobs;
CREATE POLICY "Admins can manage jobs" ON public.jobs FOR ALL TO authenticated USING (true);

-- Applications Policies
DROP POLICY IF EXISTS "Users can view own applications" ON public.applications;
CREATE POLICY "Users can view own applications" ON public.applications FOR SELECT USING (auth.uid()::text = user_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can submit own applications" ON public.applications;
CREATE POLICY "Users can submit own applications" ON public.applications FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Admins can update applications" ON public.applications;
CREATE POLICY "Admins can update applications" ON public.applications FOR UPDATE USING (auth.role() = 'authenticated');

-- Saved Jobs Policies
DROP POLICY IF EXISTS "Users can manage own saved jobs" ON public.saved_jobs;
CREATE POLICY "Users can manage own saved jobs" ON public.saved_jobs FOR ALL USING (auth.uid()::text = user_id);

-- Alerts & Messages Policies
DROP POLICY IF EXISTS "Users can read own alerts" ON public.alerts;
CREATE POLICY "Users can read own alerts" ON public.alerts FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can read own messages" ON public.messages;
CREATE POLICY "Users can read own messages" ON public.messages FOR SELECT USING (auth.uid()::text IN (sender_id, receiver_id));

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid()::text = sender_id);

DROP POLICY IF EXISTS "Participants can mark messages read" ON public.messages;
CREATE POLICY "Participants can mark messages read" ON public.messages FOR UPDATE USING (auth.uid()::text = receiver_id) WITH CHECK (auth.uid()::text = receiver_id);

-- Storage Objects Policies
DROP POLICY IF EXISTS "Users can upload own resume" ON storage.objects;
CREATE POLICY "Users can upload own resume" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'resumes' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can view own resume" ON storage.objects;
CREATE POLICY "Users can view own resume" ON storage.objects FOR SELECT USING (bucket_id = 'resumes' AND auth.role() = 'authenticated');

-- ──────────────────────────────────────────────────────────────────────────
-- 5. GRANT PERMISSIONS
-- ──────────────────────────────────────────────────────────────────────────

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. AUTO-ROUTE NEW APPLICATIONS TO A BRANCH (best-effort, by job location)
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.route_application_to_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    job_location TEXT;
    matched_branch UUID;
BEGIN
    SELECT location INTO job_location FROM public.jobs WHERE id::text = NEW.job_id::text;
    IF job_location IS NOT NULL THEN
        SELECT id INTO matched_branch FROM public.branches WHERE location = job_location LIMIT 1;
        NEW.branch_id := matched_branch;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_route_branch ON public.applications;
CREATE TRIGGER applications_route_branch
    BEFORE INSERT ON public.applications
    FOR EACH ROW EXECUTE FUNCTION public.route_application_to_branch();

-- ──────────────────────────────────────────────────────────────────────────
-- 7. ADMIN-SIDE NOTIFICATIONS
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES public.admin_users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_alerts_admin_id_idx ON public.admin_alerts (admin_id, created_at DESC);

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;
-- Server only (service role bypasses RLS); no client-facing policy.

-- Tell every active HR officer/super admin about a new application.
CREATE OR REPLACE FUNCTION public.notify_admins_new_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    job_title TEXT;
    applicant_name TEXT;
BEGIN
    SELECT title INTO job_title FROM public.jobs WHERE id::text = NEW.job_id::text;
    SELECT full_name INTO applicant_name FROM public.profiles WHERE user_id = NEW.user_id;

    INSERT INTO public.admin_alerts (admin_id, type, title, message, application_id)
    SELECT
        id,
        'NEW_APPLICATION',
        'New application',
        COALESCE(applicant_name, 'An applicant') || ' applied for ' || COALESCE(job_title, 'a job') || '.',
        NEW.id
    FROM public.admin_users
    WHERE is_active = true AND role IN ('super_admin', 'hr_officer');

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_notify_admins ON public.applications;
CREATE TRIGGER applications_notify_admins
    AFTER INSERT ON public.applications
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_application();

-- ──────────────────────────────────────────────────────────────────────────
-- 8. LIVE UPDATES FOR THE ADMIN DASHBOARD (Realtime Broadcast, no row data)
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.broadcast_table_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM realtime.send(
        jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP),
        TG_TABLE_NAME,
        'admin-updates',
        false
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS broadcast_applications_change ON public.applications;
CREATE TRIGGER broadcast_applications_change
    AFTER INSERT OR UPDATE OR DELETE ON public.applications
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_table_change();

DROP TRIGGER IF EXISTS broadcast_jobs_change ON public.jobs;
CREATE TRIGGER broadcast_jobs_change
    AFTER INSERT OR UPDATE OR DELETE ON public.jobs
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_table_change();

DROP TRIGGER IF EXISTS broadcast_messages_change ON public.messages;
CREATE TRIGGER broadcast_messages_change
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_table_change();

DROP TRIGGER IF EXISTS broadcast_admin_alerts_change ON public.admin_alerts;
CREATE TRIGGER broadcast_admin_alerts_change
    AFTER INSERT ON public.admin_alerts
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_table_change();

COMMIT;
