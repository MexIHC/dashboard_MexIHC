"""Resolve repository and data directory paths for the MexIHC dashboard."""

from __future__ import annotations

from pathlib import Path

from app.core.config import Settings


def resolve_repo_root(settings: Settings) -> Path:
    raw = (settings.research_data_root or "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    # apps/api/app/services/research_paths.py -> dashboard_MexIHC root
    return Path(__file__).resolve().parents[4]


def resolve_data_root(settings: Settings) -> Path:
    return resolve_repo_root(settings) / "data"
