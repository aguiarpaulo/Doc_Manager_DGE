"""FastAPI application factory."""

from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.api.health import router as health_router
from app.api.obras import router as obras_router
from app.api.users import router as users_router
from app.config import get_settings
from app.logging import configure_logging, get_logger


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    logger = get_logger("app.startup")
    logger.info("app_initialized", app_name=settings.app_name, environment=settings.environment)

    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(obras_router)
    app.include_router(documents_router)
    return app


app = create_app()
