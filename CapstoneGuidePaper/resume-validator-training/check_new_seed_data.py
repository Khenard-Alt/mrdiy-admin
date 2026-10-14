"""
Data-poisoning guard — run this on every new batch BEFORE moving it from
incoming/ to approved/. See CAPSTONE_ADVANCED_AI_PLANNING.md §5.6.

Why this exists: there is no automatic signal that seeded data is bad — only
evaluation after training shows it (too late to undo cheaply). This script
catches what CAN be checked before training ever runs, so a bad batch never
silently reaches the trusted dataset.

Usage:
    python check_new_seed_data.py incoming/new_batch.csv

Never auto-merges anything. Exit code 0 = passed every check, safe for a
human to move the file into approved/ by hand. Exit code 1 = at least one
check failed — do not merge until resolved.
"""

import sys
from pathlib import Path

import pandas as pd

APPROVED_DIR = Path(__file__).parent / "approved"
APPROVED_DATASET = APPROVED_DIR / "dataset.csv"

REQUIRED_COLUMNS = {"text", "label"}
MIN_TEXT_CHARS = 50          # shorter than this is probably not a usable document
MAX_LABEL_SHIFT_RATIO = 0.25  # new batch's class ratio shouldn't swing >25pp vs existing


def normalize(text: str) -> str:
    """Loose dedupe key: lowercase, collapse whitespace — catches near-duplicates
    that differ only by spacing/case, not just byte-identical copies."""
    return " ".join(str(text).lower().split())


def load_approved() -> pd.DataFrame:
    if APPROVED_DATASET.exists():
        return pd.read_csv(APPROVED_DATASET)
    return pd.DataFrame(columns=["text", "label"])


def check_batch(path: Path) -> bool:
    print(f"Checking {path} ...\n")
    ok = True

    # ── Format ──────────────────────────────────────────────────────────
    try:
        batch = pd.read_csv(path)
    except Exception as e:
        print(f"FAIL: could not read file as CSV ({e})")
        return False

    missing = REQUIRED_COLUMNS - set(batch.columns)
    if missing:
        print(f"FAIL: missing required column(s): {missing}")
        return False

    if batch["text"].isna().any() or (batch["text"].astype(str).str.strip() == "").any():
        print("FAIL: some rows have empty text.")
        ok = False

    bad_labels = ~batch["label"].isin([0, 1])
    if bad_labels.any():
        print(f"FAIL: {bad_labels.sum()} row(s) have a label that isn't 0 or 1.")
        ok = False

    if not ok:
        return False  # don't bother with the rest if the file is malformed

    # ── Length outliers ─────────────────────────────────────────────────
    too_short = batch["text"].astype(str).str.len() < MIN_TEXT_CHARS
    if too_short.any():
        print(f"WARNING: {too_short.sum()} row(s) under {MIN_TEXT_CHARS} chars — "
              "check these aren't junk/placeholder text.")
        ok = False

    # ── Duplicates within the batch itself ──────────────────────────────
    batch_norm = batch["text"].map(normalize)
    internal_dupes = batch_norm.duplicated().sum()
    if internal_dupes:
        print(f"WARNING: {internal_dupes} duplicate row(s) within this batch itself.")
        ok = False

    # ── Duplicates / near-duplicates against the already-approved set ───
    approved = load_approved()
    if not approved.empty:
        approved_norm = set(approved["text"].map(normalize))
        overlap = batch_norm.isin(approved_norm).sum()
        if overlap:
            print(f"FAIL: {overlap} row(s) already exist in approved/dataset.csv "
                  "(exact or near-duplicate) — would cause train/test leakage if merged.")
            ok = False

        # ── Label distribution shift ─────────────────────────────────
        existing_ratio = approved["label"].mean()
        batch_ratio = batch["label"].mean()
        shift = abs(existing_ratio - batch_ratio)
        if shift > MAX_LABEL_SHIFT_RATIO:
            print(f"WARNING: this batch's positive-label ratio ({batch_ratio:.2f}) "
                  f"differs a lot from the approved set's ({existing_ratio:.2f}, "
                  f"shift {shift:.2f}) — double-check the labels before merging.")
            ok = False
    else:
        print("Note: approved/dataset.csv doesn't exist yet — skipping overlap/shift checks "
              "(nothing to compare against for the first batch).")

    print()
    if ok:
        print("PASSED all checks. Safe to move this file into approved/ by hand.")
    else:
        print("DID NOT PASS. Fix the issues above before moving anything into approved/.")
    return ok


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python check_new_seed_data.py incoming/<file>.csv")
        sys.exit(2)

    target = Path(sys.argv[1])
    if not target.exists():
        print(f"File not found: {target}")
        sys.exit(2)

    passed = check_batch(target)
    sys.exit(0 if passed else 1)
