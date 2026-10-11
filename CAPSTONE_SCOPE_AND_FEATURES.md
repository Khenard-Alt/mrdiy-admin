# MR.D.I.Y. Careers — Capstone Scope & System Features

This document details the completed system features, core machine learning algorithms, and recommended scope additions for Capstone presentation and evaluation.

---

## 1. Completed & Verified Features (Ready for Capstone Defense)

### A. Machine Learning & Intelligent Recommendation Engine
- **TF-IDF + Cosine Similarity Vector Matching (`JobMatchingEngine.kt`):**
  - Converts candidate profiles/resumes and job descriptions into TF-IDF term vectors.
  - Computes angular similarity using Cosine Similarity ($0-100\%$).
  - Produces **Explainable AI (XAI)** outputs: match labels (*Excellent Match*, *Good Match*), matched skill chips, missing skill suggestions, and human-readable match reasons.
- **Multi-Factor ML Resume Validation (`ResumeRepository.kt`):**
  - Evaluates extracted candidate text across 4 independent signals (Section Headers, Contact Details, Employment Timeline, Skill Density).
  - Automatically rejects non-resume files (e.g. recipes, stories, invoices, random notes) with a clear error message before cloud storage upload.
- **Skill Extraction (`ResumeSkills.kt`):**
  - Uses word-boundary regular expressions to extract skills across retail, store operations, cash handling, warehousing, office administration, and IT.
- **Universal Search Engine (`UniversalJobSearchEngine.kt`):**
  - Supports typo-tolerant query intent parsing (e.g., `casher` $\rightarrow$ `cashier`).
  - Maps terms to 10 occupation families (Cashier, Cleaning, Warehouse, Driver, Sales, Accounting, Technology, Management, Healthcare, Education).
  - Ranks results using hybrid term relevance ($75\%$) + candidate fit ($25\%$).

### B. Authentication & Security
- **Universal Email Support (`AccountRules.kt`):**
  - Validates school emails (`.edu`, `.edu.ph`, `@student.dlsu.edu.ph`, `@ust.edu.ph`), personal emails, and corporate domains identically across Login, Register, Password Reset, and Edit Profile screens.
- **Supabase Auth (`AuthManager.kt`):**
  - Email/Password sign-up, Deep-link verification callback (`mrdiy://login-callback`), Phone OTP login, and automatic session restoration.
- **Security Guards:**
  - Mandatory Terms & Conditions acceptance guard prior to registration.
  - Concurrency `RequestGate` preventing rapid double-tap requests.

### C. Job Browsing, Applications & Profile Persistence
- **Live Published Jobs (`PublishedJobsRepository.kt`):**
  - Paginated fetching from Supabase `public.jobs` ($200$ items per page) sorted by creation date.
- **Geographic Scope Filtering (`MetroManilaScope.kt`):**
  - Enforces Metro Manila city boundary filtering (e.g. Pasig, Makati, Quezon City, Taguig).
- **One-Tap Applications (`ApplicationsRepository.kt`):**
  - `Mutex` locking (`applyLock`) preventing duplicate application submissions.
- **Saved Jobs & Offline Cache (`SavedJobsRepository.kt`):**
  - Bookmarked job list synced with Supabase `saved_jobs` and cached locally in SharedPreferences for offline access.
- **Profile Management (`ProfileRepository.kt`):**
  - User avatar/photo, education, work experience, headline, about text, and null-safe PostgREST DTO decoding.

### D. Quality Assurance
- **30 Passed Unit Tests (`:app:testDebugUnitTest`):** All core ML, search, email, and validation rules verified.
- **Clean Gradle Build (`:app:assembleDebug`):** Verified compilation and release packaging.

---

## 2. Recommended Future Additions (Within Capstone Scope)

These features fit within the scope of the study and enhance the system's impact during Capstone evaluation:

1. **Visual Application Progress Tracker (Timeline):**
   - *Description:* Visual step-by-step progress bar on `ApplicationsFragment` (`Submitted` $\rightarrow$ `Under Review` $\rightarrow$ `Shortlisted` $\rightarrow$ `Interview Scheduled` $\rightarrow$ `Hired`).
   - *Impact:* Directly addresses candidate feedback regarding application status transparency.

2. **In-App Resume Generator / Profile PDF Exporter:**
   - *Description:* Allows applicants to generate/download a styled PDF resume directly from their in-app profile.
   - *Impact:* Provides practical utility for candidates who do not possess a pre-formatted resume document.

3. **Application Status Push Notifications:**
   - *Description:* Firebase Cloud Messaging (FCM) alerts when HR updates an application status.
   - *Impact:* Demonstrates real-time mobile integration and applicant engagement.

4. **Admin Analytics Dashboard:**
   - *Description:* HR analytics displaying top searched candidate skills, average job match scores, and branch application rates.
   - *Impact:* Demonstrates Business Intelligence (BI) and data-driven decision making for HR administrators.

5. **Interview Schedule Calendar & Venue View:**
   - *Description:* Displays interview date, time, and branch venue details directly on shortlisted candidate cards.
   - *Impact:* Streamlines candidate-HR coordination.
