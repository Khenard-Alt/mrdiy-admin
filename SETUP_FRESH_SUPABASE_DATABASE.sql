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

-- Dedicated Admin Users Table (Username-Based Authentication)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT DEFAULT 'HR Administrator',
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Admin Account (Username: admin, Password: admin123)
INSERT INTO public.admin_users (username, password, full_name, role)
VALUES ('admin', 'admin123', 'MR.D.I.Y. HR Administrator', 'admin')
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
    level TEXT DEFAULT 'Not specified'
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
    UNIQUE (user_id, job_id)
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
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. APPLY ROW LEVEL SECURITY POLICIES
-- ──────────────────────────────────────────────────────────────────────────

-- Admin Users Policies
DROP POLICY IF EXISTS "Allow read access to admin_users" ON public.admin_users;
CREATE POLICY "Allow read access to admin_users" ON public.admin_users FOR SELECT USING (true);

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

COMMIT;
