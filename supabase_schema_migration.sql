-- ==========================================================================
-- SCHEMA MIGRATION for MrDIY Careers Resume Feature Redesign
--
-- This migration implements the Indeed/LinkedIn/JobStreet-style resume feature:
-- - Removes resume_text and resume_file columns (which caused data corruption)
-- - Adds resume_name and resume_uploaded_at for proper resume metadata
-- - Keeps resume_url as the single source of truth for file access
--
-- Run in Supabase SQL Editor: your project → SQL Editor → paste → RUN
-- ==========================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. DROP unused/incorrect columns
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
    DROP COLUMN IF EXISTS resume_text,
    DROP COLUMN IF EXISTS resume_file;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. ADD new columns for proper resume metadata
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS resume_name TEXT,
    ADD COLUMN IF NOT EXISTS resume_uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ──────────────────────────────────────────────────────────────────────────
-- 3. ENABLE ROW LEVEL SECURITY (if not already enabled)
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. UPDATE RLS POLICIES to include new columns
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
-- 5. STORAGE BUCKET POLICIES (for resumes bucket)
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
-- 6. ENSURE THE RESUMES BUCKET EXISTS
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'resumes',
    'resumes',
    false,
    10485760, -- 10 MB, consistent with the app
    '{application/pdf,text/plain}'
)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;


-- ──────────────────────────────────────────────────────────────────────────
-- 7. VERIFY FINAL SCHEMA
-- ──────────────────────────────────────────────────────────────────────────

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND table_schema = 'public'
  AND column_name IN (
      'user_id', 'full_name', 'location', 'desired_position', 'years_experience',
      'email', 'phone', 'about', 'skills', 'headline', 'photo_path',
      'work_experiences', 'resume_url', 'resume_name', 'resume_uploaded_at'
    )
ORDER BY ordinal_position;
