"""
MexIHC inference pipeline:
  1) Align + label raw sessions (EmotiBitTimestamp + UN)
  2) Extract ten physiological window features
  3) Stress: SVM (RBF) trained on external stress corpus (reference BACC 0.7769)
  4) Cognitive load: GB transfer S->C (reference BACC 0.8948)
  5) Per-user deltas vs Basal (global + Task 1/2/3)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

REPO_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE_DIR))

from database_features import WIN_SIZE, STEP_SIZE, extract_window_features  # noqa: E402
from ux_uv_dataset import build_ux_raw_dataset  # noqa: E402

SEED = 32

DATA_ROOT = Path(os.environ.get("RESEARCH_DATA_ROOT", REPO_ROOT / "data"))
TRAINING_CSV = Path(
    os.environ.get(
        "TRAINING_FEATURES_CSV",
        REPO_ROOT / "models" / "training_features_core10.csv",
    )
)

OUT_DIR = DATA_ROOT / "outputs"
RAW_CSV = DATA_ROOT / "dataset_ux_raw.csv"
FEAT_CSV = DATA_ROOT / "dataset_ux_features_core10.csv"
STRESS_CSV = OUT_DIR / "UX_inference_stress_svm.csv"
COGNITIVE_CSV = OUT_DIR / "UX_inference_cognitive_gb_transfer.csv"
SUMMARY_CSV = OUT_DIR / "UX_activation_summary.csv"
WINDOWS_CSV = OUT_DIR / "UX_window_scores.csv"

CORE10_FEATURES = [
    "HRV_RMSSD",
    "HRV_SDNN",
    "HRV_pNN50",
    "HRV_HF",
    "EDA_Tonic_Mean",
    "EDA_SCR_Peaks_N",
    "EDA_Tonic_SD",
    "EDA_Tonic_Slope",
    "PPG_R_Value",
    "TH_Mean",
]
BASAL = "Basal"
TASK_LABELS = ["Task 1", "Task 2", "Task 3"]
STRESS_MODEL = "SVM (RBF)"
COG_MODEL = "Gradient Boosting (transfer S->C)"
STRESS_REF_BACC = 0.7769
COG_REF_BACC = 0.8948


def _extract_ux_features(df_raw: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []
    groups = list(df_raw.groupby(["subject_id", "label", "experiment", "academic_level"]))
    for (sid, lab, exp, acad), grp in groups:
        grp = grp.sort_values("EmotiBitTimestamp").reset_index(drop=True)
        for i in range(0, max(len(grp) - (WIN_SIZE // 2), 0), STEP_SIZE):
            end = min(i + WIN_SIZE, len(grp))
            if end - i < WIN_SIZE // 2:
                continue
            feats = extract_window_features(grp.iloc[i:end])
            feats.update(
                {
                    "subject_id": sid,
                    "label": lab,
                    "experiment": exp,
                    "academic_level": acad,
                }
            )
            rows.append(feats)
    df = pd.DataFrame(rows)
    if "SpO2_R_Value" in df.columns:
        df = df.rename(columns={"SpO2_R_Value": "PPG_R_Value"})
    keep = CORE10_FEATURES + ["subject_id", "label", "experiment", "academic_level"]
    missing = [c for c in CORE10_FEATURES if c not in df.columns]
    if missing:
        raise RuntimeError(f"Missing features after extraction: {missing}")
    return df[keep]


def _within_subject_zscore(df: pd.DataFrame, feats: list[str]) -> pd.DataFrame:
    out = df.copy()
    for sid, idx in df.groupby("subject_id").groups.items():
        v = df.loc[idx, feats].astype(float).values
        mu = np.nanmean(v, axis=0)
        sd = np.nanstd(v, axis=0)
        sd[sd == 0] = 1.0
        out.loc[idx, feats] = (v - mu) / sd
    return out


def _fit_svm_predict(x_train: np.ndarray, y_train: np.ndarray, x_test: np.ndarray) -> np.ndarray:
    imp = SimpleImputer(strategy="median")
    sc = StandardScaler()
    x_tr = sc.fit_transform(imp.fit_transform(x_train))
    x_te = sc.transform(imp.transform(x_test))
    model = SVC(kernel="rbf", C=1.0, class_weight="balanced", random_state=SEED, probability=True)
    model.fit(x_tr, y_train)
    return model.predict_proba(x_te)[:, 1]


def _fit_gb_predict(x_train: np.ndarray, y_train: np.ndarray, x_test: np.ndarray) -> np.ndarray:
    imp = SimpleImputer(strategy="median")
    sc = StandardScaler()
    x_tr = sc.fit_transform(imp.fit_transform(x_train))
    x_te = sc.transform(imp.transform(x_test))
    model = GradientBoostingClassifier(n_estimators=100, random_state=SEED)
    model.fit(x_tr, y_train)
    return model.predict_proba(x_te)[:, 1]


def _binary_labels(df: pd.DataFrame, basal: str = BASAL) -> np.ndarray:
    return (df["label"].astype(str).str.lower() != basal.lower()).astype(int).values


def _aggregate_phase_scores(
    df_scored: pd.DataFrame,
    score_col: str,
    experiment_name: str,
    model_name: str,
    ref_bacc: float,
) -> pd.DataFrame:
    rows: list[dict] = []
    phases = [BASAL] + TASK_LABELS + ["__GLOBAL__"]
    for sid, g in df_scored.groupby("subject_id"):
        basal_mean = g.loc[g["label"] == BASAL, score_col].mean()
        if not np.isfinite(basal_mean):
            continue
        non_basal = g[g["label"].isin(TASK_LABELS)]
        global_mean = non_basal[score_col].mean() if not non_basal.empty else np.nan

        for phase in phases:
            if phase == BASAL:
                gg = g[g["label"] == BASAL]
            elif phase == "__GLOBAL__":
                gg = non_basal
            else:
                gg = g[g["label"] == phase]
            if gg.empty:
                continue
            event_mean = float(gg[score_col].mean())
            rows.append(
                {
                    "subject_id": sid,
                    "phase": phase,
                    "mean_score": event_mean,
                    "baseline_score": float(basal_mean),
                    "delta_score": float(event_mean - basal_mean) if phase != BASAL else 0.0,
                    "n_windows": int(len(gg)),
                    "domain": experiment_name,
                    "model": model_name,
                    "reference_bacc": ref_bacc,
                }
            )
    return pd.DataFrame(rows)


def _fix_self_report_id(sid: str) -> str:
    if sid.startswith("UX_U"):
        num = sid.replace("UX_U", "")
        return f"UX_U{int(num):02d}"
    return sid


def run_pipeline() -> None:
    if not TRAINING_CSV.is_file():
        raise FileNotFoundError(
            f"Training feature matrix not found: {TRAINING_CSV}\n"
            "Download it separately or set TRAINING_FEATURES_CSV in .env"
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("[1/5] Building raw dataset from EmotiBit exports...")
    df_raw = build_ux_raw_dataset(DATA_ROOT / "Usuarios", RAW_CSV)
    print(f"      users={df_raw['subject_id'].nunique()} rows={len(df_raw)}")

    print("[2/5] Extracting window features (60s / 30s step)...")
    df_ux = _extract_ux_features(df_raw)
    df_ux.to_csv(FEAT_CSV, index=False)
    print(f"      windows={len(df_ux)}")

    print("[3/5] Loading external training corpus...")
    df_train = pd.read_csv(TRAINING_CSV)
    feats = CORE10_FEATURES
    df_stress = df_train[df_train["experiment"].str.lower() == "stress"].copy()
    if df_stress.empty:
        raise RuntimeError("No stress rows found in training CSV.")

    x_stress = df_stress[feats].values
    y_stress = _binary_labels(df_stress)
    df_ux_z = _within_subject_zscore(df_ux, feats)
    x_ux = df_ux_z[feats].values

    print("[4/5] Inference — SVM stress + GB cognitive transfer...")
    stress_scores = _fit_svm_predict(x_stress, y_stress, x_ux)
    cog_scores = _fit_gb_predict(x_stress, y_stress, x_ux)

    df_windows = df_ux.copy()
    df_windows["stress_svm_score"] = stress_scores
    df_windows["cognitive_gb_transfer_score"] = cog_scores
    df_windows.to_csv(WINDOWS_CSV, index=False)

    df_stress_out = _aggregate_phase_scores(
        df_windows.rename(columns={"stress_svm_score": "score"}),
        "score",
        "stress",
        STRESS_MODEL,
        STRESS_REF_BACC,
    )
    df_cog_out = _aggregate_phase_scores(
        df_windows.rename(columns={"cognitive_gb_transfer_score": "score"}),
        "score",
        "cognitive_load",
        COG_MODEL,
        COG_REF_BACC,
    )
    df_stress_out["self_report_id"] = df_stress_out["subject_id"].map(_fix_self_report_id)
    df_cog_out["self_report_id"] = df_cog_out["subject_id"].map(_fix_self_report_id)
    df_stress_out.to_csv(STRESS_CSV, index=False)
    df_cog_out.to_csv(COGNITIVE_CSV, index=False)

    summary = pd.concat([df_stress_out, df_cog_out], ignore_index=True)
    summary.to_csv(SUMMARY_CSV, index=False)

    print("[5/5] Done.")
    print(f"      {STRESS_CSV}")
    print(f"      {COGNITIVE_CSV}")
    print(f"      {SUMMARY_CSV}")
    print(f"      {WINDOWS_CSV}")


if __name__ == "__main__":
    run_pipeline()
