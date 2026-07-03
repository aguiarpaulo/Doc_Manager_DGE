# NODE-016 — Deploy Docker Compose + HTTPS

## O que foi implementado

- `Dockerfile` — imagem da API (python:3.12-slim), instala deps, copia app+alembic, entrypoint.
- `docker/entrypoint.sh` — `alembic upgrade head` e depois `uvicorn app.main:app`.
- `alembic/versions/28253cca6b82_initial_schema.py` — migração inicial (7 tabelas) autogerada e validada contra Postgres real.
- `docker-compose.yml` — serviços `postgres`, `minio`, `api` (build), `caddy`; volumes persistentes; healthchecks; `depends_on: service_healthy`. Toda config sensível via `${...}`/`.env`.
- `docker/Caddyfile` + serviço caddy — terminação HTTPS (GAP-002, default Caddy com TLS automático; localhost = self-signed).
- `.env.example` / `.env` (gitignored) — variáveis de ambiente.
- `scripts/smoke_health.py`, `scripts/check_no_hardcoded_secrets.py` — checagens de smoke/revisão.

## Contrato de validação (smoke real executado)

1. **docker compose up sobe API, PostgreSQL e MinIO conectados** — `docker compose up -d --build api` subiu os 3 serviços (postgres/minio healthy, api started); `scripts/smoke_health.py` → exit 0.
2. **API alcança DB e MinIO via env e /health passa** — `GET /health` → 200 `{"status":"ok","checks":{"database":"ok","storage":"ok"}}`; migrações aplicadas no boot; logs estruturados JSON.
3. **segredos vêm de env, nada hardcoded** — `scripts/check_no_hardcoded_secrets.py` → exit 0 (compose usa `${...}`, config usa env_prefix).

## Gap relacionado

- **GAP-002** (mecanismo HTTPS): default implementado = **Caddy** com TLS automático via `CADDY_DOMAIN`. Confirmar domínio/cert de produção com o usuário; não bloqueia o stack (API+PG+MinIO verificados).
