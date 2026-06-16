"""API: save analysis-project participants."""

from __future__ import annotations

import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Request

from app.core.config import Settings, get_settings
from app.services import participant_service

router = APIRouter(prefix="/projects", tags=["projects"])

_SIGNAL_KEY_RE = re.compile(r"^signal_(?:(Basal|Task\d+)_)?([A-Z]{2})$")


@router.get("/{project_id}/participants")
def list_participants(
    project_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    return participant_service.list_participants(settings, project_id)


@router.post("/{project_id}/participants")
async def save_participant(
    request: Request,
    project_id: str,
    payload: Annotated[str, Form(description="New analysis form JSON")],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}") from e

    form = await request.form()
    signal_files: dict[str, bytes] = {}
    for key, value in form.multi_items():
        if not isinstance(key, str) or not key.startswith("signal_"):
            continue
        m = _SIGNAL_KEY_RE.match(key)
        if not m:
            continue
        task_slug, tag = m.groups()
        uf = value
        if not hasattr(uf, "read") or not getattr(uf, "filename", None):
            continue
        content = await uf.read()
        if not content:
            continue
        store_key = f"{task_slug}__{tag}" if task_slug else tag
        signal_files[store_key] = content

    try:
        return participant_service.save_participant(settings, project_id, data, signal_files or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Error writing data: {e}") from e
