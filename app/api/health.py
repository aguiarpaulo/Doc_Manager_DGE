"""Health check endpoint reporting dependency status (database and object storage)."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.logging import get_logger
from app.storage import ObjectStorage, get_storage

router = APIRouter()
logger = get_logger("app.health")


@router.get("/health")
def health(
    response: Response,
    db: Session = Depends(get_db),
    storage: ObjectStorage = Depends(get_storage),
) -> dict:
    checks: dict[str, str] = {}
    healthy = True

    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
        healthy = False

    try:
        storage.ping()
        checks["storage"] = "ok"
    except Exception:
        checks["storage"] = "error"
        healthy = False

    overall = "ok" if healthy else "unhealthy"
    logger.info("health_check", status=overall, **checks)
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": overall, "checks": checks}
