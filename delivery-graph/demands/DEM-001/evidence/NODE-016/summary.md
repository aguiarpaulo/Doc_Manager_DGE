# NODE-016 Evidence

Node: Deploy Docker Compose (API, PostgreSQL, MinIO) + terminacao HTTPS via reverse proxy

## Items

- EVD-001 [command] satisfies `smoke: docker compose up sobe API, PostgreSQL e MinIO conectados`: .venv/Scripts/python.exe scripts/smoke_health.py passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `smoke: API alcanca DB e MinIO via variaveis de ambiente e /health passa`: .venv/Scripts/python.exe scripts/smoke_health.py passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `revisao: segredos/credenciais vem de env, nada hardcoded (ver GAP-002 sobre HTTPS)`: .venv/Scripts/python.exe scripts/check_no_hardcoded_secrets.py passed
  - Artifact: artifacts/EVD-003-command.json
