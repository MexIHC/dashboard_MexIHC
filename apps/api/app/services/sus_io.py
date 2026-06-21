"""SUS self-report paths and participant ID normalization (Zenodo U01 vs activation UX_U01)."""

from __future__ import annotations

import csv
import re
from pathlib import Path


def sus_csv_path(data_root: Path) -> Path:
    return data_root / "self_report" / "SUS.csv"


def legacy_sus_csv_path(data_root: Path) -> Path:
    return data_root / "self_report" / "cognitive" / "SUS.csv"


def resolve_sus_csv_path(data_root: Path) -> Path:
    primary = sus_csv_path(data_root)
    if primary.is_file():
        return primary
    legacy = legacy_sus_csv_path(data_root)
    if legacy.is_file():
        return legacy
    return primary


def to_activation_user_id(raw: str) -> str:
    """U01 / UX_U01 / UX_U1 -> UX_U01 (matches activation self_report_id)."""
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


def to_zenodo_user_id(raw: str) -> str:
    """UX_U01 / U01 -> U01 (Zenodo deposit format)."""
    s = (raw or "").strip()
    if not s:
        return s
    m = re.match(r"^(?:UX[_-]?)?U0*(\d+)$", s, re.I)
    if m:
        return f"U{int(m.group(1)):02d}"
    return s


def read_sus_rows(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return [{k: ("" if v is None else str(v).strip()) for k, v in row.items()} for row in csv.DictReader(f)]


def load_sus_by_activation_id(data_root: Path) -> dict[str, dict[str, str]]:
    rows = read_sus_rows(resolve_sus_csv_path(data_root))
    out: dict[str, dict[str, str]] = {}
    for row in rows:
        uid = row.get("user_id", "").strip()
        if not uid:
            continue
        out[to_activation_user_id(uid)] = row
    return out
