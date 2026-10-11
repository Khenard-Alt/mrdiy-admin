# MR.D.I.Y. Careers — Overall System Architecture & Data Flow

This document details the complete end-to-end system workflow connecting the **Admin Web Dashboard**, **Android Mobile App**, **Machine Learning Engine**, and **Supabase Backend**.

---

## System Architecture Diagram

```
                             ┌──────────────────────────────────────────┐
                             │           SUPABASE CLOUD DB              │
                             │ - PostgreSQL (jobs, profiles, apps)      │
                             │ - Supabase Auth & RLS Policies           │
                             │ - Private Storage Bucket (resumes)       │
                             │ - WebSockets Realtime CDC Engine         │
                             └────────────────────┬─────────────────────┘
                                                  │
                      ┌───────────────────────────┴───────────────────────────┐
                      ▼                                                       ▼
┌──────────────────────────────────────────┐             ┌──────────────────────────────────────────┐
│      APPLICANT MOBILE APP (Android)      │             │          ADMIN WEB DASHBOARD             │
│ - Native Kotlin / ViewBinding / LiveData │             │ - Next.js / React / Supabase Web SDK     │
│ - Universal Auth (Email/Phone/Deep Link) │             │ - Job Posting & Publishing (`public.jobs`)│
│ - Multi-Factor ML Resume Validator       │             │ - Applicant Review (`applications`)      │
│ - TF-IDF + Cosine Job Matching Engine    │             │ - Candidate Resume Inspection            │
│ - Universal Search Engine (Metro Manila) │             │ - Application Status Management          │
│ - Realtime WebSockets Status Stream      │             │ - HR Analytics & Reporting               │
└──────────────────────────────────────────┘             └──────────────────────────────────────────┘
```

---

## Complete End-to-End System Journeys

### Journey 1: HR Admin Posts & Publishes a Job
1. **Admin Login:** HR administrator logs into the Admin Web Dashboard (`NEXT_PUBLIC_SUPABASE_URL`).
2. **Job Creation:** HR fills in Job Title, Location, Branch, Salary Range, Salary Period, Job Type (Full-time/Part-time), Category, Level, Role Description, Responsibilities, Requirements, and Benefits.
3. **Publishing:** HR sets job status to `published`.
4. **Database Insertion:** Row is inserted/updated in `public.jobs` in Supabase PostgreSQL.
5. **Realtime Broadcast:** Supabase Realtime WebSocket emits a Postgres CDC (Change Data Capture) event to subscribed mobile apps.

---

### Journey 2: Candidate Registration & Universal Email Verification
1. **Account Registration:** Applicant opens the Android App $\rightarrow$ Clicks Register on `RegisterFragment`.
2. **Terms Acceptance Guard:** Mandatory agreement to Terms of Service & Privacy Policy.
3. **Universal Email Validation:** Input validated via `AccountRules.email()` accepting `.edu`, `.edu.ph` (`@student.dlsu.edu.ph`, `@ust.edu.ph`, `@up.edu.ph`), personal emails (`@gmail.com`), and corporate domains.
4. **Supabase Auth Request:** App sends `signUpWith(Email)` request with metadata (`full_name`, `phone`, `terms_accepted_at`).
5. **Verification Callback:** Emailed link contains `mrdiy://login-callback`. Clicking the link opens `MainActivity`, exchanges code for session, restores profile, and redirects candidate to Onboarding/Dashboard.

---

### Journey 3: Candidate Uploads Resume & ML Content Validation
1. **File Picker:** Applicant selects a PDF or TXT file on `ResumeUploadFragment`.
2. **Text Extraction:** Extracted using `PdfBox-Android` (bounded to 10MB max, $\le 100$ pages, non-encrypted).
3. **Multi-Factor ML Resume Validation (`ResumeRepository.kt`):**
   - **Signal 1:** Section Headers (Experience, Education, Skills, Summary, Projects, CV, etc. in English and Tagalog).
   - **Signal 2:** Contact Info (email patterns, phone numbers `09xx` / `+639`).
   - **Signal 3:** Timeline & Date Patterns (e.g. `2020 - 2024`, `2019-Present`, `2 years`).
   - **Signal 4:** Skill Density (`ResumeSkills` vocabulary across retail, logistics, store ops, office, IT).
   - *If invalid (recipe, invoice, random story, blank text):* System rejects the file with an explicit error message and aborts cloud storage upload.
4. **Private Storage Upload:** Valid resume uploaded to Supabase Storage bucket `resumes` under private path `{user_id}/{filename}`.
5. **Profile Auto-Merge:** Detected skills merged with candidate profile in `public.profiles`.

---

### Journey 4: Intelligent Job Matching & Search Engine
1. **TF-IDF + Cosine Matching (`JobMatchingEngine.kt`):**
   - Constructs candidate profile text vector vs. published job document vectors.
   - Computes Cosine Similarity metric ($0-100\%$).
   - Generates **Explainable AI (XAI)** outputs: match score labels (*Excellent Match*, *Good Match*), matched skill chips, missing skill suggestions, and human-readable match reasons.
2. **Universal Search Engine (`UniversalJobSearchEngine.kt`):**
   - Typo-tolerant query parsing (`casher` $\rightarrow$ `cashier`).
   - Occupation family mapping (Cashier, Cleaning, Warehouse, Driver, Sales, Accounting, Technology, Management, Healthcare, Education).
   - Regional scope filtering (`MetroManilaScope.kt`).
   - Hybrid ranking ($75\%$ relevance + $25\%$ profile fit).

---

### Journey 5: Application Submission & Live WebSocket Status Tracker
1. **Application Submission:** Applicant taps "Apply Now" on `JobDetailFragment`.
2. **Mutex Double-Tap Guard:** `applyLock` ensures single submission per job.
3. **Database Insertion:** Inserts row in `public.applications` (`user_id`, `job_id`, `status = "Pending"`).
4. **Admin Review & Status Update:** HR Admin sees application in Web Dashboard $\rightarrow$ HR updates status (`Pending` $\rightarrow$ `Shortlisted` $\rightarrow$ `Interview Scheduled` $\rightarrow$ `Hired` $\rightarrow$ `Rejected`).
5. **Realtime WebSocket Stream (`ApplicationsRepository.kt` & `ApplicationsFragment.kt`):**
   - Candidate's phone listens to live Supabase Realtime WebSocket channel on `public.applications`.
   - Status badge updates live on candidate's screen in real-time without requiring manual page refresh!

---

## Table of Database Entities & Security Policies

| Table / Bucket | Primary Key / Path | RLS Access Policy | Purpose |
| :--- | :--- | :--- | :--- |
| `public.jobs` | `id` (Text / BigInt) | Read: Public / Applicant<br>Write: Admin only | Published job postings catalog |
| `public.profiles` | `user_id` (UUID) | Read/Write: Owner (`user_id = auth.uid()`) | Candidate profile info, skills, education, experience |
| `public.applications` | `id` (UUID) | Read/Write: Owner (`user_id = auth.uid()`) & Admin | Submitted job applications & live status tracking |
| `public.saved_jobs` | `id` (UUID) | Read/Write: Owner (`user_id = auth.uid()`) | Bookmarked jobs per applicant |
| Storage: `resumes` | `{user_id}/{filename}` | Read/Write: Owner (`{user_id} = auth.uid()`) | Private uploaded PDF/TXT resume files |
