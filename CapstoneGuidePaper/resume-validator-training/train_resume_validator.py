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
# Read from approved/ ONLY — never from incoming/ directly. New seed batches
# must pass check_new_seed_data.py and be moved into approved/ by hand first;
# this script has no way to tell good data from poisoned data on its own.
#
df = pd.read_csv("approved/dataset.csv")

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
#
# EVALUATION GATE (data-poisoning guard, §5.6): this refuses to overwrite the
# exported model if its F1 on the test set is worse than the previously
# exported one. A silently-worse model is exactly what bad seed data produces
# — this makes that impossible to ship by accident. Override only on purpose.
import json
from pathlib import Path

METADATA_PATH = Path("resume_validator_metadata.json")


def export_logistic_regression(
    vectorizer: TfidfVectorizer,
    model: LogisticRegression,
    new_f1: float,
    weights_path: str = "resume_validator_weights.json",
    force: bool = False,
) -> None:
    previous_f1 = None
    if METADATA_PATH.exists():
        previous_f1 = json.loads(METADATA_PATH.read_text(encoding="utf-8")).get("f1")

    if previous_f1 is not None and new_f1 < previous_f1 and not force:
        print(
            f"REFUSED TO EXPORT: new model's F1 ({new_f1:.3f}) is worse than the "
            f"currently exported model's F1 ({previous_f1:.3f}). The old weights file "
            "was left untouched. If this is intentional, call again with force=True."
        )
        return

    payload = {
        # vectorizer.vocabulary_ values are numpy.int64 — not JSON-serializable on
        # their own (caught live: "Object of type int64 is not JSON serializable").
        # Cast every value to a plain Python int before dumping.
        "vocabulary": {term: int(index) for term, index in vectorizer.vocabulary_.items()},
        "idf": vectorizer.idf_.tolist(),
        "weights": model.coef_[0].tolist(),
        "bias": float(model.intercept_[0]),
    }
    with open(weights_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    METADATA_PATH.write_text(json.dumps({"f1": new_f1}), encoding="utf-8")

    note = "" if previous_f1 is None else f" (previous: {previous_f1:.3f})"
    print(f"Exported to {weights_path} — F1 {new_f1:.3f}{note}")

if not df.empty:
    export_logistic_regression(vectorizer, candidates["Logistic Regression"], results["Logistic Regression"])
