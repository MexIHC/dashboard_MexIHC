from fastapi import APIRouter

from app.api.v1.endpoints import health, meta, participants, ux_uv

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(meta.router, tags=["meta"])
api_router.include_router(participants.router)
api_router.include_router(ux_uv.router)
