-- ==========================================================================
-- RLS POLICIES for MrDIY Careers Supabase Project
--
-- user_id is stored as TEXT (not UUID), so auth.uid() must be cast to ::text
--
-- Run in Supabase SQL Editor: your project → SQL Editor → paste → RUN
-- ==========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. ENABLE RLS ON PROFILES TABLE
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. profiles TABLE POLICIES (user_id is TEXT, auth.uid() cast to ::text)
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
    ON profiles
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
    ON profiles
    FOR SELECT
    USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
    ON profiles
    FOR UPDATE
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;
CREATE POLICY "Users can delete own profile"
    ON profiles
    FOR DELETE
    USING (auth.uid()::text = user_id);


-- ──────────────────────────────────────────────────────────────────────────
-- 3. STORAGE BUCKET POLICIES (resumes bucket)
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can upload own resume" ON storage.objects;
CREATE POLICY "Users can upload own resume"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'resumes'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users can view own resume" ON storage.objects;
CREATE POLICY "Users can view own resume"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'resumes'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users can update own resume" ON storage.objects;
CREATE POLICY "Users can update own resume"
    ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'resumes'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users can delete own resume" ON storage.objects;
CREATE POLICY "Users can delete own resume"
    ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'resumes'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );


-- ──────────────────────────────────────────────────────────────────────────
-- 4. CREATE THE RESUMES BUCKET (if not already exists)
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'resumes',
    'resumes',
    false,
    10485760,
    '{application/pdf,text/plain}'
)
ON CONFLICT (id) DO UPDATE SET public = false;


-- ──────────────────────────────────────────────────────────────────────────
-- 5. VERIFY SETUP
-- ──────────────────────────────────────────────────────────────────────────

SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename = 'profiles' AND schemaname = 'public';

SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';

SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';

SELECT id, name, public FROM storage.buckets WHERE id = 'resumes';

-- ========================================================================
-- 6. JOB APPLICATIONS
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    job_title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, job_id)
);

-- Existing installations may have created these IDs as UUIDs. The Android
-- job API uses string IDs, so normalize both columns before applying RLS.
ALTER TABLE public.job_applications
    ALTER COLUMN user_id TYPE TEXT USING user_id::text,
    ALTER COLUMN job_id TYPE TEXT USING job_id::text;

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own applications" ON public.job_applications;
CREATE POLICY "Users can view own applications"
    ON public.job_applications FOR SELECT
    USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can submit own applications" ON public.job_applications;
CREATE POLICY "Users can submit own applications"
    ON public.job_applications FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

GRANT SELECT, INSERT ON public.job_applications TO authenticated;

-- ========================================================================
-- 7. ALERTS AND MESSAGES
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'JOB_MATCH', title TEXT NOT NULL, message TEXT NOT NULL,
    time_ago TEXT NOT NULL DEFAULT 'Just now', is_read BOOLEAN NOT NULL DEFAULT FALSE,
    job_id TEXT
);
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL,
    sender_name TEXT NOT NULL, sender_avatar TEXT NOT NULL DEFAULT 'HR',
    last_message TEXT NOT NULL, time_ago TEXT NOT NULL DEFAULT 'Just now',
    is_read BOOLEAN NOT NULL DEFAULT FALSE, unread_count INTEGER NOT NULL DEFAULT 0,
    job_id TEXT
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own alerts" ON public.alerts;
CREATE POLICY "Users can read own alerts" ON public.alerts FOR SELECT USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "Users can read own messages" ON public.messages;
CREATE POLICY "Users can read own messages" ON public.messages FOR SELECT USING (auth.uid()::text = user_id);
GRANT SELECT ON public.alerts, public.messages TO authenticated;
