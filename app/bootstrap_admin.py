"""Startup task: seed the first administrator. Run by docker/entrypoint.sh."""

from app.config import get_settings
from app.db import SessionLocal
from app.logging import configure_logging, get_logger
from app.services.bootstrap import ensure_first_admin


def main() -> None:
    configure_logging()
    logger = get_logger("app.bootstrap")
    settings = get_settings()

    session = SessionLocal()
    try:
        created = ensure_first_admin(
            session, settings.bootstrap_admin_email, settings.bootstrap_admin_password
        )
    finally:
        session.close()

    if created:
        logger.info("first_admin_created", email=settings.bootstrap_admin_email)
    else:
        logger.info("first_admin_bootstrap_skipped")


if __name__ == "__main__":
    main()
