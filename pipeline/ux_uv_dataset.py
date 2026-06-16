"""
Snap UX UN markers to nearest EmotiBitTimestamp in EA stream; label phases by EB only.
"""
from __future__ import annotations

import glob
import os
from pathlib import Path

import numpy as np
import pandas as pd

SIGNALS = ["EA", "TH", "AX", "AY", "AZ", "GX", "GY", "GZ", "PG", "PR", "PI"]
HARDWARE_RANGES = {
    "EA": (0.01, 100.0),
    "TH": (25.0, 42.0),
    "AX": (-4.0, 4.0),
    "AY": (-4.0, 4.0),
    "AZ": (-4.0, 4.0),
    "GX": (-500.0, 500.0),
    "GY": (-500.0, 500.0),
    "GZ": (-500.0, 500.0),
    "PG": (0.0, 262144.0),
    "PR": (0.0, 262144.0),
    "PI": (0.0, 262144.0),
}

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.environ.get("RESEARCH_DATA_ROOT", REPO_ROOT / "data"))
USERS_DIR = DATA_ROOT / "Usuarios"
OUT_RAW = DATA_ROOT / "dataset_ux_raw.csv"

TAG_MAP = {
    "baseline": "baseline",
    "task1": "task1_start",
    "task1_end": "task1_end",
    "task2": "task2_start",
    "task2_end": "task2_end",
    "task3": "task3_start",
    "task3_end": "task3_end",
}


def _session_prefix(folder: Path) -> str | None:
    files = sorted(folder.glob("*_EA.csv"))
    if not files:
        return None
    return files[0].name[: -len("_EA.csv")]


def _nearest_eb(ea_sorted: np.ndarray, ts: float) -> float:
    idx = int(np.argmin(np.abs(ea_sorted - float(ts))))
    return float(ea_sorted[idx])


def _parse_un_markers(df_un: pd.DataFrame, ea_sorted: np.ndarray) -> list[tuple[str, float]]:
    """Return UN tags with EmotiBitTimestamp snapped to nearest EA sample."""
    rows: list[tuple[str, float]] = []
    for _, row in df_un.iterrows():
        tag = str(row["UN"]).strip().lower()
        if tag not in TAG_MAP:
            continue
        raw_ts = float(row["EmotiBitTimestamp"])
        rows.append((tag, _nearest_eb(ea_sorted, raw_ts)))
    return rows


def _apply_ux_labels(master_df: pd.DataFrame, marker_rows: list[tuple[str, float]]) -> pd.DataFrame:
    if not marker_rows:
        return master_df.iloc[0:0].copy()

    eb = master_df["EmotiBitTimestamp"].astype(float)
    ea_sorted = np.sort(eb.unique())
    master_df = master_df.copy()
    master_df["label"] = "DROP_ME"

    # Snap + enforce monotonic boundaries in UN file order.
    pts: dict[str, float] = {}
    prev = -np.inf
    for tag, snapped in marker_rows:
        ts = float(snapped)
        if ts <= prev:
            greater = ea_sorted[ea_sorted > prev]
            ts = float(greater[0]) if len(greater) else float(prev)
        pts[tag] = ts
        prev = ts

    if "baseline" not in pts:
        return master_df.iloc[0:0].copy()

    t1_start = pts.get("task1")
    t1_end = pts.get("task1_end", t1_start)
    t2_start = pts.get("task2", t1_end)
    t2_end = pts.get("task2_end", t2_start)
    t3_start = pts.get("task3", t2_end)
    t3_end = pts.get("task3_end", float(eb.max()))

    master_df.loc[(eb >= pts["baseline"]) & (eb < t1_start), "label"] = "Basal"
    if t1_end > t1_start:
        master_df.loc[(eb >= t1_start) & (eb < t1_end), "label"] = "Task 1"
    if t2_end > t2_start:
        master_df.loc[(eb >= t2_start) & (eb < t2_end), "label"] = "Task 2"
    if t3_end > t3_start:
        master_df.loc[(eb >= t3_start) & (eb < t3_end), "label"] = "Task 3"

    return master_df[master_df["label"] != "DROP_ME"].copy()


def process_user_folder(folder: Path) -> pd.DataFrame | None:
    prefix = _session_prefix(folder)
    if prefix is None:
        return None

    user_code = folder.name
    subject_id = f"UX_{user_code}"

    dfs: dict[str, pd.DataFrame] = {}
    for sig in SIGNALS:
        fpath = folder / f"{prefix}_{sig}.csv"
        if not fpath.is_file():
            continue
        df_t = pd.read_csv(fpath)
        df_t["EmotiBitTimestamp"] = pd.to_numeric(df_t["EmotiBitTimestamp"], errors="coerce")
        val_col = df_t.columns[-1]
        df_t = df_t[["LocalTimestamp", "EmotiBitTimestamp", val_col]].dropna(subset=["EmotiBitTimestamp"])
        df_t.columns = ["LocalTimestamp", "EmotiBitTimestamp", sig]
        lo, hi = HARDWARE_RANGES.get(sig, (-np.inf, np.inf))
        df_t.loc[(df_t[sig] < lo) | (df_t[sig] > hi), sig] = np.nan
        dfs[sig] = df_t.sort_values("EmotiBitTimestamp")

    if not dfs:
        return None

    master_key = "EA" if "EA" in dfs else max(dfs, key=lambda k: len(dfs[k]))
    master_df = dfs[master_key].copy()
    ea_sorted = np.sort(master_df["EmotiBitTimestamp"].astype(float).unique())

    for sig, df_sig in dfs.items():
        if sig == master_key:
            continue
        master_df = pd.merge_asof(
            master_df,
            df_sig.drop(columns=["LocalTimestamp"]),
            on="EmotiBitTimestamp",
            direction="nearest",
        )

    un_path = folder / f"{prefix}_UN.csv"
    if not un_path.is_file():
        return None
    df_un = pd.read_csv(un_path)
    marker_rows = _parse_un_markers(df_un, ea_sorted)
    labeled = _apply_ux_labels(master_df, marker_rows)
    if labeled.empty:
        return None

    labeled["subject_id"] = subject_id
    labeled["experiment"] = "ux"
    labeled["academic_level"] = "ux_portal"
    return labeled


def build_ux_raw_dataset(users_dir: Path | None = None, out_path: Path | None = None) -> pd.DataFrame:
    users_dir = users_dir or USERS_DIR
    out_path = out_path or OUT_RAW
    parts: list[pd.DataFrame] = []
    for folder in sorted(users_dir.iterdir()):
        if not folder.is_dir():
            continue
        df_u = process_user_folder(folder)
        if df_u is not None and not df_u.empty:
            parts.append(df_u)
    if not parts:
        raise RuntimeError("No UX user sessions could be processed.")
    out = pd.concat(parts, ignore_index=True)
    out.to_csv(out_path, index=False)
    return out


if __name__ == "__main__":
    df = build_ux_raw_dataset()
    print(f"Saved {OUT_RAW} rows={len(df)} users={df['subject_id'].nunique()}")
    print(df.groupby(["subject_id", "label"]).size().unstack(fill_value=0))
