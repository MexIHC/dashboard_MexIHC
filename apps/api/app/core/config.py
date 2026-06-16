from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    api_v1_prefix: str = "/api/v1"

    @field_validator("api_v1_prefix", mode="before")
    @classmethod
    def normalize_api_prefix(cls, v: object) -> str:
        if v is None or (isinstance(v, str) and not v.strip()):
            return "/api/v1"
        s = str(v).strip().rstrip("/")
        if not s.startswith("/"):
            s = "/" + s
        return s

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    pipeline_version: str = "0.1.0"
    data_contract_version: str = "1.0.0"
    # Empty = auto-detect dashboard_MexIHC repo root. Override if the API runs elsewhere.
    research_data_root: str = ""
    # Training feature matrix for stress/cognitive inference (not included in this repo).
    training_features_csv: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
