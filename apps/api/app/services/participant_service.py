"""Persist participants from the New analysis form into the local data tree."""

from __future__ import annotations

import csv
import json
import logging
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.services.research_paths import resolve_data_root, resolve_repo_root
from app.services.sus_io import load_sus_by_activation_id, sus_csv_path, to_zenodo_user_id

logger = logging.getLogger(__name__)

PROJECT_ID = "mexihc"

SUS_COLUMNS = [
    "user_id",
    "age",
    "gender",
    "academic_discipline",
    "current_semester",
    "sleep_hours_category",
    "stimulant_intake_recency",
    "portal_usage_frequency",
    "SUS_Q1",
    "SUS_Q2",
    "SUS_Q3",
    "SUS_Q4",
    "SUS_Q5",
    "SUS_Q6",
    "SUS_Q7",
    "SUS_Q8",
    "SUS_Q9",
    "SUS_Q10",
    "sus_score",
]

SEX_TO_GENDER: dict[str, str] = {
    "M": "1",
    "F": "2",
    "prefer_not_to_say": "4",
}

DEMO_FIELD_ALIASES: dict[str, str] = {
    "disciplina": "academic_discipline",
    "academic_discipline": "academic_discipline",
    "major": "academic_discipline",
    "carrera": "academic_discipline",
    "semestre": "current_semester",
    "current_semester": "current_semester",
    "sueno": "sleep_hours_category",
    "sleep": "sleep_hours_category",
    "sleep_hours_category": "sleep_hours_category",
    "estimulante": "stimulant_intake_recency",
    "caffeine": "stimulant_intake_recency",
    "stimulant_intake_recency": "stimulant_intake_recency",
    "uso_portal": "portal_usage_frequency",
    "portal": "portal_usage_frequency",
    "portal_usage_frequency": "portal_usage_frequency",
}

INFERENCE_SIGNALS = {"EA", "TH", "AX", "AY", "AZ", "GX", "GY", "GZ", "PG", "PR", "PI", "UN"}


def normalize_user_id(raw: str) -> tuple[str, str]:
    """Return (self_report_id UX_U03, folder U3)."""
    s = raw.strip()
    if not s:
        raise ValueError("Participant ID is empty")

    m = re.match(r"^UX[_-]?U?0*(\d+)$", s, re.I)
    if m:
        n = int(m.group(1))
        return f"UX_U{n:02d}", f"U{n}"

    m = re.match(r"^U0*(\d+)$", s, re.I)
    if m:
        n = int(m.group(1))
        return f"UX_U{n:02d}", f"U{n}"

    m = re.match(r"^(\d+)$", s)
    if m:
        n = int(m.group(1))
        return f"UX_U{n:02d}", f"U{n}"

    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", s)[:32]
    return f"UX_{slug}", slug


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return [{k: ("" if v is None else str(v).strip()) for k, v in row.items()} for row in csv.DictReader(f)]


def _write_csv_rows(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fieldnames})


def _demo_field_from_label(label: str) -> str | None:
    key = label.strip().lower().replace(" ", "_")
    return DEMO_FIELD_ALIASES.get(key)


def _build_sus_row(payload: dict[str, Any], user_id: str) -> dict[str, str]:
    demo = payload.get("demographics") or {}
    row: dict[str, str] = {c: "" for c in SUS_COLUMNS}
    row["user_id"] = user_id

    age = str(demo.get("age") or "").strip()
    if age:
        row["age"] = age

    sex = str(demo.get("sex") or "").strip()
    if sex in SEX_TO_GENDER:
        row["gender"] = SEX_TO_GENDER[sex]

    for item in demo.get("custom") or []:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        value = str(item.get("value") or "").strip()
        if not label or not value:
            continue
        field = _demo_field_from_label(label)
        if field and field in row:
            row[field] = value

    usability = payload.get("usability") or {}
    if usability:
        score = str(usability.get("sus_score_0_100") or "").strip()
        if score:
            row["sus_score"] = score
        items = usability.get("items_1_5") or {}
        if isinstance(items, dict):
            for k, v in items.items():
                col = k if k.startswith("SUS_Q") else f"SUS_Q{k}"
                if col in row:
                    row[col] = str(v).strip()

    return row


def _upsert_sus_row(sus_path: Path, new_row: dict[str, str]) -> None:
    rows = _read_csv_rows(sus_path)
    uid = to_zenodo_user_id(new_row["user_id"])
    new_row = {**new_row, "user_id": uid}
    updated = False
    for i, row in enumerate(rows):
        if to_zenodo_user_id(row.get("user_id", "")) == uid:
            merged = {**row, **{k: v for k, v in new_row.items() if v != ""}}
            rows[i] = merged
            updated = True
            break
    if not updated:
        rows.append(new_row)
    _write_csv_rows(sus_path, SUS_COLUMNS, rows)


def _save_manifest(data_root: Path, user_id: str, payload: dict[str, Any]) -> Path:
    reg = data_root / "participants_registry"
    reg.mkdir(parents=True, exist_ok=True)
    path = reg / f"{user_id}.json"
    doc = {
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id,
        "payload": payload,
    }
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _session_prefix() -> str:
    now = datetime.now()
    return now.strftime("%Y-%m-%d_%H-%M-%S") + f"-{now.microsecond // 1000:03d}"


def _save_signal_files(
    user_folder: Path,
    prefix: str,
    files: dict[str, bytes],
) -> list[str]:
    user_folder.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    for key, content in files.items():
        if "__" in key:
            task_slug, tag_u = key.split("__", 1)
            tag_u = tag_u.upper()
        else:
            task_slug = None
            tag_u = key.upper()
        if tag_u not in INFERENCE_SIGNALS:
            continue
        mid = f"{task_slug}_" if task_slug else ""
        dest = user_folder / f"{prefix}_{mid}{tag_u}.csv"
        dest.write_bytes(content)
        saved.append(f"{task_slug + ':' if task_slug else ''}{tag_u}")
    return saved


def _pipeline_env(settings: Settings, repo: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["RESEARCH_DATA_ROOT"] = str(resolve_data_root(settings))
    training = (settings.training_features_csv or "").strip()
    if training:
        env["TRAINING_FEATURES_CSV"] = training
    else:
        default_training = repo / "models" / "training_features_core10.csv"
        if default_training.is_file():
            env["TRAINING_FEATURES_CSV"] = str(default_training)
    return env


def _run_script(script: Path, repo: Path, env: dict[str, str], timeout: int = 900) -> dict[str, Any]:
    if not script.is_file():
        return {"ok": False, "error": f"Script not found: {script}"}
    try:
        proc = subprocess.run(
            [sys.executable, str(script)],
            cwd=str(repo),
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": (proc.stdout or "")[-4000:],
            "stderr": (proc.stderr or "")[-4000:],
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Pipeline timed out"}
    except OSError as e:
        return {"ok": False, "error": str(e)}


def save_participant(
    settings: Settings,
    project_id: str,
    payload: dict[str, Any],
    signal_files: dict[str, bytes] | None = None,
) -> dict[str, Any]:
    if project_id.strip().lower() not in (PROJECT_ID, "ux_uv"):
        raise ValueError(f"Unknown project: {project_id}. Use '{PROJECT_ID}'.")

    repo = resolve_repo_root(settings)
    data_root = resolve_data_root(settings)
    data_root.mkdir(parents=True, exist_ok=True)

    demo = payload.get("demographics") or {}
    user_id, folder = normalize_user_id(str(demo.get("subject_id") or ""))

    sus_path = sus_csv_path(data_root)
    sus_row = _build_sus_row(payload, user_id)
    domain = str(payload.get("domain") or "")

    if domain == "usability_sus" and not sus_row.get("sus_score"):
        raise ValueError("Missing SUS score (0–100) or the 10 items.")

    has_demo = any(sus_row.get(c) for c in ("age", "gender", "sus_score") if c in sus_row)
    if has_demo or domain == "usability_sus":
        sus_path.parent.mkdir(parents=True, exist_ok=True)
        if not sus_path.exists():
            _write_csv_rows(sus_path, SUS_COLUMNS, [])
        _upsert_sus_row(sus_path, sus_row)

    manifest_path = _save_manifest(data_root, user_id, payload)

    saved_signals: list[str] = []
    prefix = _session_prefix()
    if signal_files:
        user_folder = data_root / "Usuarios" / folder
        saved_signals = _save_signal_files(user_folder, prefix, signal_files)

    inference_result: dict[str, Any] | None = None
    join_result: dict[str, Any] | None = None
    saved_tags = set()
    for entry in saved_signals:
        saved_tags.add(entry.split(":")[-1] if ":" in entry else entry)
    can_infer = "EA" in saved_tags

    if can_infer:
        pipeline = repo / "pipeline"
        env = _pipeline_env(settings, repo)
        inference_result = _run_script(pipeline / "run_inference.py", repo, env)
        if inference_result.get("ok"):
            join_result = _run_script(pipeline / "join_sus_activation.py", repo, env)

    messages: list[str] = [f"Participant {user_id} saved."]
    if saved_signals:
        messages.append(f"Signals saved: {', '.join(sorted(saved_signals))}.")
    if can_infer:
        if inference_result and inference_result.get("ok"):
            messages.append("Physiological inference completed.")
            if join_result and join_result.get("ok"):
                messages.append("SUS ↔ activation join updated.")
            elif join_result:
                messages.append("Warning: could not update SUS ↔ activation join.")
        else:
            messages.append("Warning: signals were saved but inference failed.")
    elif saved_signals:
        messages.append("For automatic inference, include EDA (EA) in the uploaded signals.")

    return {
        "ok": True,
        "project_id": PROJECT_ID,
        "user_id": user_id,
        "folder": folder,
        "sus_saved": domain == "usability_sus" or bool(sus_row.get("sus_score")),
        "manifest_path": str(manifest_path),
        "signals_saved": saved_signals,
        "session_prefix": prefix if saved_signals else None,
        "inference": inference_result,
        "join": join_result,
        "message": " ".join(messages),
    }


def list_participants(settings: Settings, project_id: str) -> dict[str, Any]:
    data_root = resolve_data_root(settings)
    reg = data_root / "participants_registry"
    sus_by_user = load_sus_by_activation_id(data_root)

    participants: list[dict[str, Any]] = []
    if reg.is_dir():
        for path in sorted(reg.glob("*.json")):
            try:
                doc = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            uid = str(doc.get("user_id") or path.stem)
            sus = sus_by_user.get(uid, {})
            participants.append(
                {
                    "user_id": uid,
                    "saved_at": doc.get("saved_at"),
                    "sus_score": sus.get("sus_score") or None,
                    "age": sus.get("age") or None,
                    "gender": sus.get("gender") or None,
                }
            )

    for uid, sus in sus_by_user.items():
        if sus.get("sus_score") and not any(p["user_id"] == uid for p in participants):
            participants.append(
                {
                    "user_id": uid,
                    "saved_at": None,
                    "sus_score": sus.get("sus_score"),
                    "age": sus.get("age"),
                    "gender": sus.get("gender"),
                }
            )

    return {"project_id": project_id, "participants": participants, "count": len(participants)}
