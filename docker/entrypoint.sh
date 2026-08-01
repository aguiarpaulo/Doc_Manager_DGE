#!/usr/bin/env bash
set -e

# Apply database migrations, seed the first administrator if configured, then start the API.
alembic upgrade head
python -m app.bootstrap_admin
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
