"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GED_", env_file=".env", extra="ignore")

    app_name: str = "GED DGE"
    environment: str = "development"

    jwt_secret: str = "change-me-in-production-with-a-long-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    reset_token_expire_minutes: int = 60

    database_url: str = "postgresql+psycopg://ged:ged@localhost:5432/ged"

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "documents"
    minio_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
