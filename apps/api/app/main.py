import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    get_settings.cache_clear()
    settings = get_settings()
    app = FastAPI(title="MexIHC Multimodal UX Dashboard API", version="0.1.0")

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api_prefix = (settings.api_v1_prefix or "").strip().rstrip("/") or "/api/v1"
    app.include_router(api_router, prefix=api_prefix)
    return app


app = create_app()
