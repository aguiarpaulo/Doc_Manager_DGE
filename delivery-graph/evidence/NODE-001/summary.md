# NODE-001 — Scaffold do projeto

## O que foi implementado

Estrutura base do projeto Python/FastAPI, gerenciada por `uv`:

- `pyproject.toml` — deps (fastapi, uvicorn, sqlalchemy, alembic, psycopg, structlog, pydantic-settings) e dev-deps (pytest, httpx, ruff); config de ruff e pytest.
- `app/config.py` — `Settings` via pydantic-settings, todas as configs por variável de ambiente (prefixo `GED_`), incluindo `database_url` e credenciais MinIO. Nada hardcoded.
- `app/logging.py` — `configure_logging()` configura structlog com renderer JSON (log estruturado).
- `app/db.py` — engine SQLAlchemy 2.0 + `SessionLocal` + `Base` declarativa + dependência `get_session`.
- `app/main.py` — factory `create_app()` que configura logging, emite evento estruturado `app_initialized` e registra o router de health.
- `app/api/health.py` — `GET /health` básico (checagem de dependências vem no NODE-014).
- `alembic/` — ambiente de migrações apontado para `Base.metadata` e para a `database_url` das settings.
- `tests/test_scaffold.py` — boot da app, health 200, e verificação de saída de log estruturado (JSON).

## Contrato de validação

1. **ruff check passa sem erros** — `uv run ruff check .` → All checks passed.
2. **pytest executa a suite** — `uv run pytest` → 3 passed.
3. **app FastAPI inicia e emite log estruturado** — `uv run pytest tests/test_scaffold.py` cobre boot (TestClient → /health 200) e a emissão de evento structlog em JSON.

## Notas

- Warning `StarletteDeprecationWarning` sobre httpx no TestClient é da versão instalada do starlette; não afeta os testes (3 passed).
