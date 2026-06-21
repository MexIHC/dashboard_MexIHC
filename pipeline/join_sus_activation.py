"""Join SUS self-report with activation summary (stress + cognitive load)."""
from __future__ import annotations

import os
import re
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.environ.get("RESEARCH_DATA_ROOT", REPO_ROOT / "data"))

SUS_CSV = DATA_ROOT / "self_report" / "SUS.csv"
LEGACY_SUS_CSV = DATA_ROOT / "self_report" / "cognitive" / "SUS.csv"
SUMMARY_CSV = DATA_ROOT / "outputs" / "UX_activation_summary.csv"
OUT_CSV = DATA_ROOT / "outputs" / "UX_sus_activation_join.csv"


def _resolve_sus_csv() -> Path:
    if SUS_CSV.is_file():
        return SUS_CSV
    if LEGACY_SUS_CSV.is_file():
        return LEGACY_SUS_CSV
    return SUS_CSV


def _to_activation_user_id(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return s
    m = re.match(r"^UX[_-]?U0*(\d+)$", s, re.I)
    if m:
        return f"UX_U{int(m.group(1)):02d}"
    m = re.match(r"^U0*(\d+)$", s, re.I)
    if m:
        return f"UX_U{int(m.group(1)):02d}"
    return s


def main() -> None:
    sus = pd.read_csv(_resolve_sus_csv())
    act = pd.read_csv(SUMMARY_CSV)

    wide = act.pivot_table(
        index=["self_report_id", "phase"],
        columns="domain",
        values="delta_score",
        aggfunc="first",
    ).reset_index()
    wide.columns.name = None
    wide = wide.rename(
        columns={
            "stress": "stress_delta",
            "cognitive_load": "cognitive_delta",
        }
    )

    sus["self_report_id"] = sus["user_id"].astype(str).map(_to_activation_user_id)
    merged = sus.merge(wide, on="self_report_id", how="left")
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(OUT_CSV, index=False)
    print(f"Saved {OUT_CSV}")


if __name__ == "__main__":
    main()
