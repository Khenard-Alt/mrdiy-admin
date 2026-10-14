"""
Builds the first seed batch for the Resume Validator from public sources —
writes to incoming/, NOT approved/, per the data-poisoning safeguard workflow
(§5.6): every new batch must pass check_new_seed_data.py before a human moves
it into approved/.

Sources (both real, public, downloaded once into raw-sources/ — see that
folder's provenance below):
  - Positive (label=1, "is a resume"): Shawn0069/resume_classification_kaggle
    on Hugging Face — a mirror of the same Kaggle "Resume Dataset" (LiveCareer
    resumes) referenced in CAPSTONE_ADVANCED_AI_PLANNING.md §5.6. Category
    doesn't matter for this binary task — any real resume counts.
  - Negative (label=0, "not a resume"): fancyzhx/ag_news on Hugging Face —
    short news snippets, clearly not resumes, a different register/length/
    structure than a resume (serves the same role the plan's "recipes,
    invoices, articles" examples do).

Run:  python prepare_dataset.py
Output: incoming/batch_001.csv
"""

import pandas as pd

SAMPLE_SIZE_PER_CLASS = 500
RANDOM_SEED = 42

# %% ── 1. Load positive examples (real resumes) ─────────────────────────────
resumes = pd.read_parquet("raw-sources/resumes_train.parquet")
resumes = resumes[["Resume_str"]].rename(columns={"Resume_str": "text"})
resumes["text"] = resumes["text"].str.strip()
resumes = resumes[resumes["text"].str.len() > 50]  # drop empty/junk rows
resumes["label"] = 1

print(f"Resumes available: {len(resumes)}")

# %% ── 2. Load negative examples (news snippets) ───────────────────────────
agnews = pd.read_parquet("raw-sources/agnews_train.parquet")
agnews = agnews[["text"]].copy()
agnews["text"] = agnews["text"].str.strip()
agnews = agnews[agnews["text"].str.len() > 50]
agnews["label"] = 0

print(f"News articles available: {len(agnews)}")

# %% ── 3. Sample for class balance (checklist item 2, §5.6) ────────────────
resumes_sample = resumes.drop_duplicates(subset="text").sample(
    n=min(SAMPLE_SIZE_PER_CLASS, len(resumes)), random_state=RANDOM_SEED
)
agnews_sample = agnews.drop_duplicates(subset="text").sample(
    n=min(SAMPLE_SIZE_PER_CLASS, len(agnews)), random_state=RANDOM_SEED
)

# %% ── 4. Combine, shuffle, export ──────────────────────────────────────────
combined = pd.concat([resumes_sample, agnews_sample], ignore_index=True)
combined = combined.sample(frac=1, random_state=RANDOM_SEED).reset_index(drop=True)

print(f"\nFinal batch: {len(combined)} rows")
print(combined["label"].value_counts())

combined.to_csv("incoming/batch_001.csv", index=False)
print("\nWrote incoming/batch_001.csv — run check_new_seed_data.py on it next.")
