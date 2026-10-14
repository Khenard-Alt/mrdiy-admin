"""
Resume Validator v2 — training script (offline only, never runs in production).
See CAPSTONE_ADVANCED_AI_PLANNING.md §5.6 for the full architecture and the
data-quality checklist this script follows.

Each `# %%` marks a VS Code notebook cell (Python extension runs them one at a
time with Shift+Enter) — or run the whole file as a plain script once the
dataset step below is filled in.

STATUS: scaffold only. Step 2 (load dataset) is a placeholder — dataset
research/curation is a separate step, done right before training, not now.
"""

# %% ── 1. Imports ──────────────────────────────────────────────────────────
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import LinearSVC
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, f1_score

RANDOM_SEED = 42

# %% ── 2. Load dataset — PLACEHOLDER, fill in after data research ──────────
# Two columns required: `text` (resume or non-resume document text) and
# `label` (1 = resume, 0 = not a resume). Positive examples: any real resume,
# category doesn't matter. Negative examples: recipes, invoices, articles —
# anything that isn't a resume. See §5.6 checklist before filling this in.
#
# df = pd.read_csv("dataset.csv")  # TODO: seed this file last, right before training
df = pd.DataFrame(columns=["text", "label"])  # empty until dataset is ready

# %% ── 3. Data-quality checks (§5.6 checklist — run BEFORE training) ───────
def run_data_quality_checks(frame: pd.DataFrame) -> None:
    if frame.empty:
        print("No data loaded yet — fill in step 2 first.")
        return

    # 1. Duplicates (data leakage risk if a duplicate lands in both splits)
    dupes = frame.duplicated(subset="text").sum()
    print(f"Duplicate rows: {dupes}" + (" — drop these before splitting." if dupes else " — clean."))

    # 2. Class imbalance
    counts = frame["label"].value_counts()
    print(f"Class balance: {counts.to_dict()}")
    ratio = counts.min() / counts.max()
    if ratio < 0.5:
        print(f"  Warning: imbalanced ({ratio:.2f}x) — consider balancing or weighting classes.")

    # 3. Label sanity (manual step — not automatable)
    print("Reminder: spot-check a sample of labels by hand before trusting this dataset.")

    # 5. Distribution mismatch — Taglish/local-context coverage
    print("Reminder: make sure the TEST set includes some real Taglish/Filipino resumes,")
    print("not just the English-only source dataset — see §5.6 point 5.")


run_data_quality_checks(df)

# %% ── 4. Clean + split (80/20, stratified) ────────────────────────────────
if not df.empty:
    df = df.drop_duplicates(subset="text")  # checklist item 1
    X_train, X_test, y_train, y_test = train_test_split(
        df["text"], df["label"],
        test_size=0.2, stratify=df["label"], random_state=RANDOM_SEED,
    )

# %% ── 5. Vectorize (TF-IDF — same concept as lib/matching.ts) ─────────────
if not df.empty:
    vectorizer = TfidfVectorizer(lowercase=True, stop_words="english", max_features=5000)
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)

# %% ── 6. Train and compare 3 candidate models ─────────────────────────────
if not df.empty:
    candidates = {
        "Logistic Regression": LogisticRegression(max_iter=1000, random_state=RANDOM_SEED),
        "Multinomial Naive Bayes": MultinomialNB(),
        "Linear SVM": LinearSVC(random_state=RANDOM_SEED),
    }

    results = {}
    for name, model in candidates.items():
        model.fit(X_train_vec, y_train)
        preds = model.predict(X_test_vec)
        results[name] = f1_score(y_test, preds)
        print(f"\n=== {name} ===")
        print(classification_report(y_test, preds, target_names=["Not resume", "Resume"]))
        print("Confusion matrix:\n", confusion_matrix(y_test, preds))

    best_name = max(results, key=results.get)
    print(f"\nBest model by F1: {best_name} ({results[best_name]:.3f})")

# %% ── 7. Export weights + vocabulary as JSON (for TypeScript inference) ───
# Only Logistic Regression exports cleanly to a simple weights+vocab JSON
# (linear model: score = sigmoid(dot(tfidf_vector, weights) + bias)).
# If Logistic Regression wasn't the best in step 6, revisit this export step.
import json

def export_logistic_regression(vectorizer: TfidfVectorizer, model: LogisticRegression, path: str) -> None:
    payload = {
        "vocabulary": vectorizer.vocabulary_,
        "idf": vectorizer.idf_.tolist(),
        "weights": model.coef_[0].tolist(),
        "bias": float(model.intercept_[0]),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    print(f"Exported to {path}")

# export_logistic_regression(vectorizer, candidates["Logistic Regression"], "resume_validator_weights.json")
