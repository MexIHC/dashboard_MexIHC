from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter()


@router.get("/meta")
def meta() -> dict[str, str]:
    s = get_settings()
    return {
        "pipeline_version": s.pipeline_version,
        "data_contract_version": s.data_contract_version,
        "api": "mexihc-dashboard-api",
    }
