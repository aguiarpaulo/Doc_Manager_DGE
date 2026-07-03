FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for layer caching.
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
        "fastapi>=0.115" "uvicorn[standard]>=0.32" "sqlalchemy>=2.0" "alembic>=1.14" \
        "psycopg[binary]>=3.2" "structlog>=24.4" "pydantic-settings>=2.6" "bcrypt>=4.2" \
        "pyjwt>=2.10" "email-validator>=2.2" "minio>=7.2" "python-multipart>=0.0.12" "pyotp>=2.9"

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
