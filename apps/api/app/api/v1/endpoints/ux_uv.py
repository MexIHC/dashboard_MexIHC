from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import Settings, get_settings
from app.services import ux_uv_data

router = APIRouter(prefix="/ux-uv", tags=["ux-uv"])


@router.get("/cohort-summary")
def cohort_summary(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    return ux_uv_data.build_cohort_summary(settings)


@router.get("/research-summary")
def research_summary(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    return ux_uv_data.build_research_summary(settings)


@router.get("/subjects")
def list_subjects(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    return ux_uv_data.list_subjects(settings)


@router.get("/subject/{user_id}")
def subject_detail(user_id: str, settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    detail = ux_uv_data.build_subject_detail(settings, user_id)
    err = detail.get("error")
    if err == "not_found":
        raise HTTPException(status_code=404, detail=f"Participant not found: {user_id}")
    if err == "empty_id":
        raise HTTPException(status_code=400, detail="empty user_id")
    return detail


@router.get("/questionnaires")
def questionnaires(
    settings: Annotated[Settings, Depends(get_settings)],
    preview_rows: int = Query(10, ge=1, le=50),
) -> dict:
    return ux_uv_data.questionnaires_preview(settings, limit=preview_rows)
