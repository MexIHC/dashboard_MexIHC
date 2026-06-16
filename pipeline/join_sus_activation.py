"""Join SUS self-report with activation summary (stress + cognitive load)."""
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.environ.get("RESEARCH_DATA_ROOT", REPO_ROOT / "data"))

SUS_CSV = DATA_ROOT / "self_report" / "cognitive" / "SUS.csv"
SUMMARY_CSV = DATA_ROOT / "outputs" / "UX_activation_summary.csv"
OUT_CSV = DATA_ROOT / "outputs" / "UX_sus_activation_join.csv"


def main() -> None:
    sus = pd.read_csv(SUS_CSV)
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

    merged = sus.merge(wide, left_on="user_id", right_on="self_report_id", how="left")
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(OUT_CSV, index=False)
    print(f"Saved {OUT_CSV}")


if __name__ == "__main__":
    main()
