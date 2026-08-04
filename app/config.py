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

    smtp_host: str = ""  # empty = dev mode: reset tokens are logged, not e-mailed
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""  # sender address; falls back to smtp_user when empty
    smtp_starttls: bool = True
    reset_url_base: str = ""  # e.g. https://ged.example.com/reset-password

    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
