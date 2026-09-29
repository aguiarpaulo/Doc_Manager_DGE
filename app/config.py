"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import field_validator
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

    # Single public base for every link the API puts in an e-mail. The SPA and the
    # API share one origin, so one value covers both the reset screen and the
    # signing screen; keeping two bases is how they drift apart.
    app_url_base: str = ""  # e.g. https://ged.example.com

    # Origens autorizadas a chamar a API de outro endereço, separadas por vírgula.
    # Vazio em producao de proposito: o Caddy serve SPA e API na mesma origem, entao
    # nao ha chamada cruzada e liberar origem so ampliaria a superficie. O servidor
    # de desenvolvimento (Vite em :5173) e outro endereco e precisa ser nomeado aqui,
    # senao o navegador barra toda requisicao no preflight.
    cors_origins: str | list[str] = ""

    bootstrap_admin_username: str | None = None
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None

    @field_validator("cors_origins", mode="after")
    @classmethod
    def _origens_em_lista(cls, valor: str | list[str]) -> list[str]:
        """Aceita a lista separada por virgula que uma variavel de ambiente carrega.

        Uma variavel escrita a mao quase sempre traz espaco em volta, e um valor
        vazio nao pode virar uma origem chamada string vazia — que casaria com o
        cabecalho `Origin: null` de um documento sem origem.
        """
        if isinstance(valor, str):
            valor = valor.split(",")
        return [item.strip() for item in valor if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
