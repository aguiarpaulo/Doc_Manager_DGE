# NODE-001 Evidence

Node: Scaffold do projeto (FastAPI, config por env, SQLAlchemy+Alembic, structlog, ruff/pytest)

## Items

- EVD-001 [command] satisfies `ruff check passa sem erros`: .venv/Scripts/ruff.exe check . passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest executa a suite com sucesso (mesmo minima)`: .venv/Scripts/pytest.exe -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `app FastAPI inicia e emite log estruturado (structlog)`: .venv/Scripts/pytest.exe tests/test_scaffold.py -q passed
  - Artifact: artifacts/EVD-003-command.json
