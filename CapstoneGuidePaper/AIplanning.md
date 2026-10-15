# MR.D.I.Y. Careers — Advanced AI/ML & Pre-Employment Planning Specification

This document provides a comprehensive engineering blueprint for advanced AI/ML features, pre-employment onboarding workflows, hiring velocity estimation, candidate strengths/weaknesses diagnostics, explainable AI ranking, and AI job description generation for the HR Admin portal.

---

## Architecture Overview

Status legend: ✅ done (Section 1-3) · 🔵 PLANNED, has phases (Section 5, 5.6) · ⚪ idea only, no code (Section 6.1-6.3) · ⚠️ superseded (Section 4)

```mermaid
graph LR
    subgraph "APPLICANT AI/ML MODULES — ✅ DONE (§1-3)"
        A[Resume Text Extractor<br/>PdfBox-Android] --> B[Multi-Factor Resume Validator<br/>Headers + Contact + Timeline + Skills]
        B --> C[Skill Density Extractor<br/>ResumeSkills Regex Vocabulary]
        C --> D[Profile Skill Auto-Merge]
        D --> E[TF-IDF + Cosine Matching Engine<br/>JobMatchingEngine.kt]
        E --> F[Explainable AI XAI Engine<br/>Match Score + Reason + Chips]
        F --> Z[Hiring Velocity Estimator<br/>§2.1]
        F --> Z2[Strengths/Weaknesses Diagnostic<br/>§2.2]
    end

    subgraph "ADMIN RECRUITMENT AI — 🔵 PLANNED (§5)"
        G[Layer 1: TF-IDF Retrieval<br/>own job corpus] --> H[Layer 2: Compliance Rules<br/>+ draft/warnings]
        H -->|cold start, no match| GM[Layer 3: Gemini<br/>cold-start handler]
        H -->|sufficient match| PUB[Jobs page]
        GM --> H2[Layer 2 again: Guardrail] --> PUB
    end

    subgraph "RESUME VALIDATOR v2 — ✅ DONE, advisory-only (§5.6)"
        RVR2[Rule-based validator<br/>sections + contact + timeline + skills] -->|accept/reject, unchanged| RVOUT[Resume / Not a resume]
        RV[Trained classifier<br/>Logistic Regression + TF-IDF] -.->|logged, never blocks| RVOUT
    end

    subgraph "FUTURE DIRECTIONS (§6)"
        PM[Proactive re-matching<br/>✅ done, §6.1] -.-> E
        DV[Document verification AI<br/>✅ done, §6.2] -.-> GM
        FAQ[Conversational FAQ assistant<br/>✅ done, §6.3] -.-> GM
    end
```

---

## Section 1: Pre-Employment Steps & Onboarding Checklist Workflow

### 1.1 Objective
Provide an interactive pre-employment onboarding workflow for candidates who reach the "Shortlisted" or "Hired" stage, guiding them through required pre-employment documents and government compliance steps before day 1 of work.

### 1.2 Requirements Checklist
- SSS Number / E-1 Form
- PhilHealth Member Data Record (MDR)
- Pag-IBIG MID Number / Member Data Form
- NBI Clearance / Police Clearance
- Pre-Employment Medical Exam / Health Permit
- BIR Form 1902 / TIN
- Signed Employment Contract

### 1.3 Data Schema (Supabase PostgreSQL)
Table Name: `public.pre_employment_requirements`
- `id` (UUID, Primary Key, default `gen_random_uuid()`)
- `user_id` (TEXT, Foreign Key -> `profiles.user_id`)
- `application_id` (UUID, Foreign Key -> `applications.id`)
- `requirement_name` (TEXT, e.g., 'NBI Clearance')
- `status` (TEXT: 'Pending', 'Uploaded', 'Verified', 'Rejected')
- `document_url` (TEXT)
- `updated_at` (TIMESTAMPTZ, default `now()`)

### 1.4 Workflow Sequence
```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Applicant
    participant App as ApplicationsFragment
    participant DB as Supabase DB
    participant Admin as Admin Web Portal

    App->>DB: Fetch Requirements for Application ID
    DB-->>App: List of 7 Requirement Items with Status
    Candidate->>App: Uploads Document (PDF / Image) for NBI Clearance
    App->>DB: Updates Status -> 'Uploaded' & Sets document_url
    Admin->>DB: HR Inspects Document & Clicks "Verify"
    DB-->>App: Realtime Status Update -> 'Verified' (Progress Bar Updates: 5/7 = 71%)
```

---

## Section 2: Hiring Velocity Estimator & Strengths/Weaknesses ML Diagnostic

### 2.1 Hiring Velocity Estimator Algorithm
Predicts estimated turnaround days from application submission to official job offer.

$$\text{Estimated Days} = \text{Base Timeline (7 Days)} + \Delta_{\text{Match}} + \Delta_{\text{Profile}} + \Delta_{\text{Docs}} + \Delta_{\text{Gaps}}$$

- **Base Hiring Timeline:** 7 Business Days
- **Score Adjustments ($\Delta$):**
  - Match Score $\ge 85\%$: $-2$ Days (High urgency priority hire)
  - Complete Profile & Uploaded Resume: $-1$ Day
  - Complete Pre-Employment Documents: $-1$ Day
  - Lacks core skills ($< 50\%$ match): $+3$ Days
  - Experience Level Mismatch: $+2$ Days
- **Output Format:** `"Estimated Hiring Velocity: 2 - 4 Business Days"`

### 2.2 Strengths and Weaknesses ML Diagnostic Engine
Class Name: `CandidateDiagnosticEngine.kt`

#### A. Strengths
- Core Skill Matches: Matches between candidate skills and job requirements.
- Experience Fit: Candidate years of experience vs required level.
- Geographic Fit: Lives within Metro Manila branch boundary (`LocationDistance.kt`).
- Example Outputs:
  - `[+]` *"Strong Cash Handling & POS expertise (3+ years)"*
  - `[+]` *"High TF-IDF similarity in Store Management & Inventory Auditing"*
  - `[+]` *"Location match: Pasig City (Branch Proximity ~4.2 km)"*

#### B. Weaknesses / Skill Gaps
- Missing Core Skills: Key requirements listed in job description missing from candidate profile.
- Missing Certifications: e.g., Forklift license, First Aid certification.
- Example Outputs:
  - `[-]` *"Lacks listed requirement: Forklift Operation Certification"*
  - `[-]` *"No prior experience listed in Visual Merchandising"*

---

## Section 3: Explainable AI (XAI) Ranking Explanation Engine

### 3.1 Objective
Provide transparent, human-readable explanations detailing WHY a candidate was ranked at a specific position and match percentage, eliminating black-box AI mistrust.

### 3.2 Mathematical Model (TF-IDF & Cosine Similarity)

**What TF-IDF actually means — not just the acronym, but what it really stands for:**

**TF-IDF** stands for **Term Frequency – Inverse Document Frequency**. It has two parts, each with its own job:

- **Term Frequency (TF)** — "how often this word appears IN ONE document." For example, if the word "cashier" appears 10 times in a 200-word resume, its TF is high there. **Intuition:** if a resume mentions a word often, it's likely important to that person.

- **Inverse Document Frequency (IDF)** — "how rare this word is ACROSS ALL documents" (across the whole collection/corpus — all job postings or resumes). This is the opposite: if a word appears in ALMOST ALL documents (e.g. "the," "and," "experience"), its IDF is **low** — it's just a common word, meaningless as a "distinguishing trait." But if it rarely appears (e.g. "forklift" or "cashiering"), its IDF is **high** — meaning it's an important word for telling this document apart from others. **Intuition:** a rare word = a better "fingerprint" for identifying a document.

- **TF-IDF = TF × IDF** — combines both: a word scores high if it **appears often in ONE document, BUT is rare across ALL the others.** This is how the system finds which words truly "represent" a resume or job posting, instead of just counting words.

**A concrete example:** in a resume, the word "the" might appear 20 times (high TF) but it also appears in ALL other resumes (low IDF) — so its final TF-IDF score stays low, it's not treated as an "important word." Meanwhile, the word "forklift" might appear only 2 times (lower TF than "the") but only a FEW resumes contain this word (high IDF) — so its final TF-IDF is higher, making it more "meaningful" for identifying that person's actual specialty.

Once each word's TF-IDF score is computed, the whole document (resume or job) is converted into a "vector" (a list of numbers, one number per word in the vocabulary) — this is where **Cosine Similarity** comes in, which measures how "aligned in direction" two vectors are (0% = no similarity, 100% = identical). This is used to determine how similar a resume is to a job posting, or how similar a new job title is to existing postings (Layer 1 of the JD Generator, §5).

**Mathematical representation:**

$$\text{TF}(t, d) = \frac{f_{t,d}}{\sum_{t' \in d} f_{t',d}}$$

$$\text{IDF}(t, D) = \ln\left( \frac{|D|}{1 + |\{d \in D : t \in d\}|} \right)$$

$$\text{TF-IDF}(t, d, D) = \text{TF}(t, d) \times \text{IDF}(t, D)$$

Cosine Similarity Equation:

$$\text{Cosine Similarity}(\vec{A}, \vec{B}) = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \|\vec{B}\|} = \frac{\sum_{i=1}^{n} A_i B_i}{\sqrt{\sum_{i=1}^{n} A_i^2} \sqrt{\sum_{i=1}^{n} B_i^2}}$$

### 3.3 XAI Explanation Template Output
> *"Candidate [Name] is ranked at #[Rank] with a [Score]% Match for [Job Title]. This ranking is driven by a [Similarity]% text similarity in [Category] roles, matching [MatchedCount] out of [TotalReqs] primary job requirements ([SkillsList]). Candidate experience of [Years] years aligns with the [Level] requirement."*

---

## Section 4: AI Job Description Generator for Admin Web Portal — ⚠️ SUPERSEDED, see Section 5

This idea (template-based only, no ML) was **replaced by the Layered AI Job Description Generator in Section 5**, which has its own TF-IDF retrieval + rules as the core, with Gemini as the cold-start handler. Left here only as a record of the original proposal.

### 4.1 Objective
Assist HR Administrators when creating or editing job postings in the Admin Web Portal (`mrdiy-admin`) by automatically generating optimized, retail-ready job descriptions based on the specified job title.

### 4.2 UI & Functionality
- **UI Button:** `✨ Generate AI Description` button next to Description field in `mrdiy-admin/app/jobs/page.tsx`.
- **Input:** Job Title (e.g., *"Store Supervisor"*, *"Warehouse Crew"*, *"Cashier"*, *"HR Officer"*).
- **Template Output Structure:**
  - About the Role
  - Key Responsibilities
  - Requirements
  - Benefits

---

## Section 5: Layered AI Job Description Generator — PLANNED (2026-10-14)

This replaces the approach in Section 4 (template-based, no ML).

**Loose end resolved (2026-10-15):** we initially considered making this a trained classifier using the 24-category Kaggle resume dataset (HR, Sales, IT, Aviation, Advocate, Agriculture...). **That idea was dropped** — it fell out of scope, since most of the 24 categories have nothing to do with MR.DIY's actual positions (Cashier, Stock Clerk, Store Manager, etc.). The Resume Validator (§5.6) is the trained-model feature now, not the JD Generator.

### 5.1 Rule (capstone constraint)

- **"Just a plain AI API" is not allowed.** The study's title is *"A Mobile-Based Recruitment System Using Machine Learning For Mr. D.I.Y."* The title does not mention an API; it's only a suggestion. So the core must be **the system's own ML**, with the external AI API (Gemini) as an additional layer on top.
- **Gemini is not "just for polish" (revised 2026-10-15).** Earlier decision: Gemini = "optional, just smooths out the wording." But the user's point was correct: if everything is already in the database (existing job postings), what is AI's real contribution if it's only used in the common case? **Layer 1 (TF-IDF retrieval) only works if there's a similar existing posting.** When it's a new kind of job with no example yet in the database (cold start — e.g. the first time posting "IT Support Technician"), **Layer 1 finds nothing**, producing a weak or blank output. That's where calling Gemini becomes **mandatory** — no longer optional, because there's no other source of content. When there are 2+ good matching existing postings, Layer 1+2 alone is enough (no Gemini, fast, free).
- **Test (revised):** not "remove Gemini, it should still work" but rather "when there's a sufficiently similar existing posting (not cold-start), it should work without Gemini." Gemini itself cannot simply be removed from the whole system, but there's a clear condition for when it's actually needed.
- **No new training required.** Uses ML already in scope: TF-IDF + cosine similarity (fitted on MR.DIY's own job corpus) and the skill extraction vocabulary.

### 5.2 Layers

```
HR input: job title, category, level, branch, contract duration
        │
Layer 1 — OWN ML (core, works even offline)
        • TF-IDF + cosine (same engine as matching, lib/matching.ts)
          → finds the top-k most similar existing MR.DIY job
            postings in the `jobs` table
        • Builds a draft from their responsibilities/requirements
          (retrieval-based generation, not a copy of a single posting)
        • Skill extraction (ResumeSkills vocabulary) → suggested skills
        │
Layer 2 — OWN RULES (MR.DIY standard + compliance)
        • Complete sections: About the Role / Key Responsibilities /
          Requirements / Benefits
        • Mandatory benefits (SSS, PhilHealth, Pag-IBIG), contract duration
          if Contractual, branch/location
        • Flags banned wording (e.g. age limit — RA 10911, Anti-Age
          Discrimination in Employment Act)
        │
Layer 3 — Gemini (COLD-START HANDLER, mandatory when <2 similar postings)
        • Condition: only called when Layer 1 lacks enough similar
          postings (low similarity score) — when there are enough,
          it is not called, Layer 1+2 alone is used
        • Input: the draft from Layer 1+2 (grounded in job title/category/
          level/compliance rules), not just a blank job title
        • Generates new content when there's no similar posting; if a
          Layer 1 draft exists, only polishes it; not allowed to add
          new salary, benefits, or requirements
        • No key / no internet / error → Layer 2's base template becomes
          the final result (compliant but generic, not retrieval-based)
        │
Layer 2 again — GUARDRAIL on Gemini's output
        • Are the sections still complete? Any invented salary/benefits?
          Any banned wording? If it fails → the Layer 2 draft is returned instead
        │
Layer 4 — HR review and edit before publishing (a human always makes the final call)
```

### 5.3 Shown in the UI (Jobs page, admin)

- Button: **"✨ Generate description"** next to the Description field.
- After generating, HR sees:
  - the draft (editable),
  - **"Based on:"** a list of the existing postings it drew from + similarity % if there's a match (explainable, same concept as "Why this rank") — or **"No similar posting found — generated by Gemini"** if cold-start,
  - a clear label for what happened: **"Generated from existing postings"** (Layer 1+2 only) / **"Written by Gemini — no similar role yet"** (cold-start) / **"Polished by Gemini"** (similar posting exists, just polished),
  - Layer 2 warnings (e.g. "Age requirement detected — remove before publishing").

### 5.4 How to defend this in the panel

| Panel question | Answer |
|---|---|
| "Isn't that just an API?" | No. The core is our own TF-IDF + cosine over the MR.DIY job corpus — it works without Gemini in most cases (when there's a sufficiently similar existing posting). |
| "Where's the ML?" | Layer 1: TF-IDF (IDF learned from the job corpus) + cosine similarity retrieval + skill extraction. Same engine as the app's matching. |
| "Why is Gemini needed if everything's already in the database?" | Because Layer 1 relies on an EXISTING similar posting — it has nothing when it's a new kind of job. That's when Gemini becomes mandatory, because there's no other source of content. Once there's a sufficient match, it's not used. |
| "What if Gemini gets it wrong?" | There's a guardrail (Layer 2 again) and HR review (Layer 4) before publishing. |
| "Is it explainable?" | Yes. It shows which postings it drew from, how similar they are, or whether it was cold-start and actually came from Gemini. |

### 5.5 Phases

| Phase | What to do | Checkpoint |
|---|---|---|
| 1 | Layer 1 + 2 (API route in `mrdiy-admin`, no Gemini) | ✅ **Done (2026-10-15)** — lint + build + `curl` test against the real database. 4 bugs found and fixed during testing (details in `CapstoneGuidePaper/jdGenerator.md`) — wrong similarity threshold, category/level overwhelming the title, two age-limit phrasings that weren't caught. |
| 2 | UI button + "Based on" + warnings on the Jobs page | ✅ **Done, browser-verified (2026-10-15 to 2026-10-16).** A real stale-state bug was found and fixed here: `generatorResult`/`generatorError` were only cleared in `closeModal()`, not in `openAddModal()`, `openEditModal()`, or `handleSubmit()`'s success path — meaning a saved/edited job could show a leftover draft from a previous job. Fixed, then verified live in the browser: empty-title error message, Cancel-then-reopen blank state, Edit-different-job blank state, generation variety across repeated calls, and button-disabled-while-generating all pass. A few cold-start-case and cosmetic common-case checklist items remain code-confirmed but not individually clicked through — see `CapstoneGuidePaper/jdGenerator.md`. |
| 3 | Layer 3 Gemini (cold-start handler) + guardrail | ✅ **Done, with a full live round-trip verified (2026-10-16).** 3 bugs found and fixed during earlier testing (overly strict prompt, no timeout, and — found later — a wrong model name, `gemini-3.8-flash`, which doesn't exist on this account; fixed to `gemini-3.6-flash`, confirmed directly against Gemini's API). Also added: retry-on-503, and variety in the generic fallback (which had its own bug — biased random pick, fixed). **Live-verified on the deployed site:** a cold-start request ("Veterinary Surgeon") reached Gemini successfully — the first full round-trip seen all session — but its draft was missing the mandatory benefits (SSS, PhilHealth, Pag-IBIG), so the Layer 2 guardrail correctly rejected it and fell back to the Layer 2 generic draft, exactly as designed (`source: "layer2-generic"`, `geminiAttemptRejected` listing the three missing-benefit warnings). This is real evidence the guardrail catches non-compliant AI output, not just a theoretical safeguard. Details in `CapstoneGuidePaper/jdGenerator.md`. |

### 5.6 Resume Validator — trained model built, but kept advisory-only after real comparison (decision 2026-10-14, revised 2026-10-15)

This is the best-fit candidate for training, already in scope: the **Resume Validator** (`ResumeRepository.kt`), rule-based ("is this a resume or not," 4 hand-tuned-threshold signals in `ResumeValidator.kt`).

**Originally planned architecture** (trained model primary, Gemini fallback on low confidence) — see the "To be compared" note below for why this was revised after actually running the comparison.

```
Uploaded document (text from extraction)
        │
RULE-BASED VALIDATOR (ResumeValidator.kt) — the real gate, unchanged
        • 4 signals: section headings, contact info, timeline, skill density
        │
TRAINED MODEL (ResumeMlClassifier.kt) — advisory only, logged alongside
        • Binary classifier (Logistic Regression + TF-IDF), ported to Kotlin
        • Runs on every upload, result logged for comparison, never blocks
        │
Result: the rule-based verdict decides accept/reject, as before. The
        trained model's verdict + confidence is logged (Logcat) so the
        two can be compared over time without risking real applicants.
```

**Why there's no live Python in production:** Python is only used for training (offline, Colab/notebook) — it doesn't run in the real system. After training, the simple linear model (weights + TF-IDF vocabulary) is translated into Kotlin (`ResumeMlClassifier.kt`, ported from the exported `resume_validator_weights.json` — not TypeScript as originally planned, since the actual consumer of this check is the Android app, not the admin web) — no need to deploy, host, or maintain a separate Python microservice.

**Compared — real result, not as originally expected (2026-10-15):** old (rules) vs new (trained model), evaluated on the hand-labeled sample corpus already used by `ResumeValidatorTest.kt`/`ResumeValidationTest.kt` (short, casual, Philippine-context resumes, several with Tagalog headers) — see `mrdiyreact/app/src/test/java/com/mrdiy/careers/ValidatorComparisonTest.kt`.

| | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Rule-based (`ResumeValidator`) | 100% (11/11) | 1.00 | 1.00 | 1.00 |
| Trained model (`ResumeMlClassifier`) | 72.7% (8/11) | 1.00 | 0.40 | 0.57 |

The trained model missed 3 of 5 real resumes in this set (mobile-only contact, Tagalog headers, an IT resume mentioning "installation/wireless"), while never wrongly accepting a non-resume (precision stayed perfect). **Why:** its 99.5% F1 was measured on its own Hugging Face test split — full-length, formal, English-only professional resumes (LiveCareer) vs. news articles — a much easier and different distribution than the short, casual, Taglish-inclusive resumes real MR.D.I.Y. applicants actually submit. The model learned "long, formal, English document" as a proxy for "resume," which breaks down exactly on the kind of input this app needs to handle well.

**Decision:** keep the rule-based validator as the real gate. The trained model runs advisory-only — every upload also gets classified by it, logged for comparison, but it never blocks or accepts an upload on its own. Promoting it to primary, as originally planned, would reject valid applicants that pass today. The Gemini-fallback idea for low-confidence cases is **deferred** — it's moot while the trained model isn't the primary gate, and there's no existing Android-to-backend bridge to Gemini yet anyway (Android only talks to a separate PHP backend via Retrofit; Gemini is only ever called server-side from Next.js in `mrdiy-admin`).

**What would change this:** retraining on a dataset that actually resembles real applicant resumes — shorter, more casual, Taglish-inclusive — rather than LiveCareer's professional-resume corpus. Not attempted in this pass; noted as future work rather than reworked under time pressure before the defense.

**Sequence (revised 2026-10-15 — files/libs prepared, but the dataset itself comes last, after research):**

| Step | What to do | Status |
|---|---|---|
| A | Prepare the training scaffold: folder, `requirements.txt`, script skeleton with a data placeholder | ✅ Done — `CapstoneGuidePaper/resume-validator-training/` (`requirements.txt`, `train_resume_validator.py`), verified: `pip install` + script run with no data, empty-data guard worked. **Explanation of each Python library** (what each is for, and why not PyTorch/TensorFlow): `CapstoneGuidePaper/resume-validator-training/README.md`. |
| B | Research and curate the dataset (checklist below — dedupe, balance, etc.) | ✅ **Done (2026-10-15).** Positive (resume): a Hugging Face mirror of the Kaggle "Resume Dataset" (LiveCareer), `Shawn0069/resume_classification_kaggle` (1,986 real resumes after removing duplicates/junk). Negative (not a resume): `fancyzhx/ag_news` (120,000 news snippets, clearly not resumes — serving the same role as "recipes/invoices/articles" in the original plan). Two public datasets, no account/API key needed — downloaded via Hugging Face's `datasets-server` API (direct parquet links). |
| C | Seed the actual dataset file (`dataset.csv`) | ✅ **Done.** `prepare_dataset.py` — sampled 500 resumes + 500 news articles (balanced), placed into `incoming/batch_001.csv`, passed `check_new_seed_data.py` (no warnings), manually moved to `approved/dataset.csv`. **1,000 rows, 500/500 balanced.** |
| D | Run the script: clean → split → train 3 models → compare → export the best one | ✅ **Done, real results.** F1: Logistic Regression 0.995, Naive Bayes 0.990, Linear SVM 1.000. Exported Logistic Regression (`resume_validator_weights.json`, 5,000-word vocabulary) — chosen because it's the only "linear model" that can be exported as a simple weights+vocabulary JSON for TypeScript inference (§5.6), even though SVM scored higher on F1. **Bug found and fixed:** `numpy.int64` in the vocabulary dict can't be JSON-serialized directly — cast to plain Python `int` before exporting. |

**Data-poisoning safeguards — code done, not just a warning (2026-10-15)**

In addition to the checklist below, this is a **real safeguard** built into the workflow itself, not just a reminder:

- **`incoming/` vs `approved/` staging folders** — the training script reads ONLY from `approved/dataset.csv`, never directly from `incoming/`. No new data is simply "trusted."
- **`check_new_seed_data.py`** — run this against every new batch BEFORE moving it to `approved/`. It checks: (1) format/missing columns, (2) labels that aren't 0/1, (3) text that's too short (<50 chars), (4) duplicates within the batch, (5) duplicates/near-duplicates against the ALREADY-APPROVED dataset (train/test leakage risk), (6) a sudden shift in class ratio vs the existing dataset. Nothing moves to `approved/` automatically — a human still makes the final call, even if every check passes.
- **Evaluation gate on export** — `export_logistic_regression()` **refuses to export** if the new model's F1 is lower than the last exported version — a better model can never be silently replaced by a worse one, even by accident.
- **Verified:** tested `check_new_seed_data.py` against deliberately broken sample data (wrong label, duplicate, too short) — correctly caught each one, correct exit code.

**Checklist — things to avoid in training data (decision 2026-10-15)**

Before training, check the dataset against this list first — this matters because **there's no automatic signal that seeded data is bad**; only evaluation (F1/accuracy on the test set) will reveal it, so these problems need to be avoided BEFORE training:

1. **Duplicate/near-identical examples** — most dangerous if a copy ends up in both the train AND test set ("data leakage"): accuracy looks high but is fake, not genuinely learned. Remove duplicates before splitting.
2. **Class imbalance** — if the count of positive (resume) and negative (not-resume) examples is far apart, the model will just learn to always answer the majority class. Keep the counts close, or look at precision/recall per class, not just overall accuracy.
3. **Negative examples that are too easy** — if the "not a resume" examples are too obvious (e.g. random articles), the model will just learn a shortcut instead of truly understanding. Include hard/close negative examples too.
4. **Mislabeled data (label noise)** — spot-check a sample of the dataset before using it, especially if it's a scraped/third-party source.
5. **Distribution mismatch — specific to us** — the Kaggle dataset is English-only (LiveCareer/US), but our real applicants may write in **Taglish or heavily-localized English**. ✅ **Tested (2026-10-15)**, confirmed as a real effect, not a hypothetical: `ValidatorComparisonTest.kt`'s held-out Taglish set (2 real Taglish resumes, 2 non-resumes) found the trained model misclassifies one of the two Taglish resumes as not-a-resume (probability 0.327, below the 0.5 threshold) — directly in line with the broader finding above that short/Taglish-inclusive resumes are outside what this training data covers well.

### 5.7 Rules that ALL AI features must follow (whether Gemini or a trained model) — decision 2026-10-14

**A. Scoped/guarded prompt — won't answer outside its scope.**
- Every call to Gemini has a strict system prompt that limits it only to its task (e.g. "job description generation for MR.DIY retail roles ONLY" or "resume classification ONLY") — if someone tries to ask something else (general chat, other topics), it refuses or falls back to a default unrelated response.
- This is the answer for the panel if asked: "This isn't a general-purpose chatbot — every AI call has a strict boundary."

**B. Traceable sources — applicants/HR need transparency.**
- No AI output is allowed to be a "black box." Every result must have a **traceable basis within the system itself** — not necessarily a literal external link, but a concrete reference:
  - JD Generator → "Based on: [job postings used] + similarity %" (§5.3)
  - Matching/ranking → "Why this rank" with a keyword breakdown (already in the system)
  - Resume Validator → which signals/words triggered the decision, and whether the own model or the Gemini fallback produced the result
- This is the same spirit as the Explainable AI we already have — just extended as **a rule for every future AI feature**, not only matching.

### 5.8 Gemini's role across the system's AI — not just for the FAQ (decision 2026-10-15)

Gemini has one consistent role across **all** AI features, not just the conversational assistant (§6.3): **it handles the cases the system's own ML/database can't** — it's not a general-purpose generator, but always fills a specific "gap."

| Feature | Own ML/data (tried first) | When Gemini fills the "gap" |
|---|---|---|
| **JD Generator** (§5) | TF-IDF retrieval over existing MR.DIY job postings | **Cold start** — no/few similar postings in the database (a new kind of job) |
| **Resume Validator** (§5.6) | Trained binary classifier (Logistic Regression/Naive Bayes + TF-IDF) | **Low confidence** — the own model isn't sure whether it's a resume or not |
| **Document verification** (§6.2, ✅ done) | — (no own vision/OCR model) | **The whole task** — Gemini Vision does the document reading itself (name match, expiry, document-type check), but HR always makes the real Verify/Send-back decision — the AI result is advisory-only, never auto-acted on |
| **FAQ assistant** (§6.3, ✅ done) | A single job posting's own data as context | **Natural-language questions** — not a structured query, so a conversational layer over that one job's data is needed; scoped to public job content only, never personal application data |

**The pattern:** database/own ML first (fast, free, explainable) → Gemini only when there's a real gap it can't cover — cold start, low confidence, no existing automated check, or natural-language input. This isn't "AI just so AI runs" — there's a specific reason it runs in each case, and the reason is always documented (§5.7B, traceable sources).

---

## Section 6: Additional directions for expanding the AI — PLANNED (2026-10-14)

Options discussed for further expanding the system's AI, beyond the JD Generator (§5) and Resume Validator (§5.6). No code yet; listed only as options.

**6.1 Proactive re-matching — ✅ Done (2026-10-15)**

When a new job posting is published, past applicants who were a decent fit for a similar role before but weren't hired for a reason unrelated to skill (wrong branch, old posting closed/expired) get a notification: *"You were a strong candidate for a similar [Category] role before — [Job Title] just opened, might be a better fit."*

**No new model** — `notifyNearMissPastApplicants()` (new, in `lib/notifications.ts`) reuses the exact same TF-IDF + cosine engine (`lib/matching.ts`) and the same `JOB_MATCH_THRESHOLD` that `notifyNewJob()` already used for its "matches your profile" blast — just pointed at a narrower, more relevant audience: people who already applied for something similar, re-scored fresh against the new job.

**How "branch/timing, not skill" is inferred:** there's no stored rejection-reason in `applications`, so this is a heuristic, not a read of HR's actual reasoning — an old application with status `Rejected` or `On Hold`, for a job in the same `category`, where the old job's `branch_id` differs from the new one's, or the old posting is no longer open (closed/deadline passed). Documented as an inference, not a certainty.

**No double-alerting:** `notifyNewJob()` now takes an `excludeUserIds` set; the jobs API route runs `notifyNearMissPastApplicants()` first and passes its matched user IDs in, so nobody gets both the personalized near-miss alert and the generic "new job published"/"matches your profile" alert for the same posting.

**Files touched:** `lib/notifications.ts` (new `RECOMMENDED_JOB` alert type, new function, `excludeUserIds` param on `notifyNewJob`), `app/api/jobs/route.ts` (`notifySafely` now calls both, same error-swallowing pattern — a notification failure still never blocks saving a job). No Android changes needed — `alerts.job_id` deep-linking already existed. No DB migration — no new columns.

Verified: `npm run lint` (0 errors), `npm run build` (compiles, type-checks), and a live end-to-end test against the real dev database (2026-10-15) — a disposable test applicant, a Rejected application for an old job in Antipolo, and a newly-published job in the same category in Cainta, all deleted immediately after. **Found and fixed one real bug in the process:** the first version queried `applications` with a PostgREST embedded join (`jobs!inner(...)`) to pull the old job's category/branch in one call — this codebase has no FK relationship registered in Supabase's schema cache for `applications.job_id` → `jobs.id` (confirmed: every other route in the app joins jobs/applications manually in two queries, never via embedding), so it failed with "Could not find a relationship between 'applications' and 'jobs'." Fixed by switching to the same two-query-then-join-in-JS pattern already used everywhere else. After the fix, the live test produced exactly the intended `RECOMMENDED_JOB` alert ("You were a strong candidate for a similar Sales role before — ...") for the test applicant, with no duplicate generic alert for them, while the dedupe/exclude-set behavior worked correctly.

**6.2 Document verification AI — ✅ Done (2026-10-15)**

HR can click **"🔎 Check with AI"** next to any uploaded-but-undecided document (Valid ID, NBI Clearance, SSS, etc.) in either `ProfileDocumentsPanel.tsx` (profile-level documents) or `RequirementsPanel.tsx` (per-application pre-employment checklist). Gemini Vision reads the document image/PDF and reports whether it looks like the claimed document type, whether the visible name matches the applicant's profile, and whether a visible expiry date has passed — shown as a one-line advisory note next to the existing manual Verify/Send-back buttons. **It never auto-verifies or auto-rejects anything** — HR always makes the real decision (§5.7B).

**New, separate file (`lib/documentVerification.ts`), not an extension of `lib/gemini.ts`:** per §5.7A, every AI call gets its own narrow scope — `lib/gemini.ts` is specifically the JD Generator's cold-start text handler and only sent text parts; this is an unrelated task (vision input), so it got its own system prompt and its own `analyzeDocument()` function, reusing only the low-level fetch/timeout/retry-once-on-503 pattern `lib/gemini.ts` already established. The request adds an `inline_data: { mime_type, data: base64 }` part alongside the text prompt — Gemini's existing `generateContent` endpoint already accepts this, so it was additive, not a rewrite.

**On-demand, not automatic on upload:** HR triggers the check themselves (same reasoning as the JD Generator's Gemini layer — not the first thing tried, and never slows down the ordinary upload flow). The result is cached in a new nullable `ai_review jsonb` column (migration `202610150001_document_ai_review.sql`, added to both `applicant_documents` and `pre_employment_requirements` — no destructive change, both tables already shared the same verify/reject shape).

**New endpoints:** `POST /api/applicant-documents/ai-check` and `POST /api/requirements/ai-check` — two thin routes (consistent with the existing one-route-per-feature split rather than one shared parameterized route), each: downloads the file via `supabase.storage.from(bucket).download(path)` (same pattern as `lib/resumeText.ts`'s resume reading, not the signed-URL pattern — that one's for browser links only), sniffs the mime type from magic bytes (PDF/JPEG/PNG), looks up the applicant's `full_name`, calls `analyzeDocument()`, and writes the result into `ai_review`. Never throws on a Gemini failure — same "AI check unavailable" non-blocking fallback already established for the JD Generator.

**Verified live (2026-10-15):** `npm run lint`/`npm run build` both clean, plus an end-to-end test against the real dev database using a disposable test applicant and a synthetic test "NBI Clearance" image (generated with Pillow) — deliberately with a name that didn't match the profile ("ZZZ TEST APPLICANT" on the document vs. "Pedro Reyes" in the profile) and an expiry date in the past, uploaded to the real `applicant-documents` bucket, then deleted immediately after. The AI check correctly flagged all three things: `looksValid: false` ("lacking official NBI clearance features and layout"), `nameMatches: false`, `expired: true` — a coherent one-sentence `reasoning` matched the test setup exactly.

**6.3 Conversational assistant for applicant FAQs — ✅ Done, pending one config value (2026-10-15)**

A "💬 Ask a question" button on the Android app's job detail screen (`JobDetailFragment.kt`) opens a bottom sheet (`FaqChatBottomSheetFragment.kt`) where an applicant can ask about that specific job or the application process. Each question is answered fresh and grounded only in that job's own title/description/responsibilities/requirements/benefits — no multi-turn memory kept client- or server-side, keeping the "grounded, not free-form chat" rule (§5.7A) simple and honest.

**A new architectural precedent — the first-ever Android-to-mrdiy-admin bridge.** Every prior Android network call goes to a separate, externally-hosted PHP backend (`mrd-i-y-careers.onrender.com`, not in either repo, not editable here); every existing `mrdiy-admin` route requires `requireAdminSession`, which an applicant request can't satisfy. This feature adds `mrdiy-admin/app/api/public/faq-chat/route.ts` — a **public, unauthenticated** endpoint, deliberately scoped to read-only, non-personal data only (a published job posting's own public fields; never a specific applicant's account or application status, since there's no way to verify identity on an unauthenticated request). A basic in-memory per-IP rate limit (10 requests / 5 minutes) guards against abuse of this public, Gemini-backed endpoint — explicitly a best-effort guard (resets on redeploy, doesn't coordinate across multiple server instances), not a production-grade abuse-prevention system; an accepted, documented limitation for a capstone demo, not something hidden.

**New file `lib/faqAssistant.ts`**, separate from `lib/gemini.ts` and `lib/documentVerification.ts` per §5.7A (every AI call gets its own narrow scope) — its own system prompt, refusing anything outside this one job's content or the general application process, including explicitly refusing personal/account-specific questions it has no way to actually answer. Same low-level request pattern as the other two: `AbortSignal.timeout(25_000)`, retry once on 503.

**Android side:** new `network/FaqApiService.kt` + a second Retrofit client `network/AdminRetrofitClient.kt` (separate from the existing PHP-backend `RetrofitClient.kt` — different host), pointed at the real deployed URL, `https://mrdiy-admin-three.vercel.app/` (deployed 2026-10-15 on Vercel, from `github.com/Khenard-Alt/mrdiy-admin`).

**Verified end-to-end on the live deployment (2026-10-16):** `npm run lint`/`npm run build` both clean. The per-IP rate limiter was confirmed correct (tripped exactly at the 10-request boundary across a burst of calls). A real grounded question against the deployed site ("What are the requirements for this role?" on a real published job) returned a correct, on-topic answer quoting that job's actual requirements. An out-of-scope question ("What is the weather today?") was correctly refused (`{"ok":false,"reason":"out-of-scope"}`). **One real bug found and fixed along the way:** the model name `gemini-3.8-flash`, used throughout this session for all three Gemini-backed features, does not exist on this account — it was silently causing the persistent 503/429 failures mistaken for free-tier flakiness. Fixed to `gemini-3.6-flash` (confirmed directly against Gemini's API, and the model actually listed as available in Google AI Studio for this account) across `lib/gemini.ts`, `lib/documentVerification.ts`, and `lib/faqAssistant.ts`. The Android UI/flow itself has not been run (no JDK on this machine) — the user verifies the on-device experience themselves.

**Suggested order:** 6.1 first (no new dependency, quick to demo), then 6.2 if a "weightier" AI feature is wanted for the defense, 6.3 if there's still time.
