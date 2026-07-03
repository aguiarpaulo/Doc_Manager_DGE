# NODE-016 Verification

Node: Deploy Docker Compose (API, PostgreSQL, MinIO) + terminacao HTTPS via reverse proxy
Verified: 2026-07-03T19:56:15.035Z

## Required evidence

- smoke: docker compose up sobe API, PostgreSQL e MinIO conectados: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe scripts/smoke_health.py passed
    - Artifact: artifacts/EVD-001-command.json
- smoke: API alcanca DB e MinIO via variaveis de ambiente e /health passa: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe scripts/smoke_health.py passed
    - Artifact: artifacts/EVD-002-command.json
- revisao: segredos/credenciais vem de env, nada hardcoded (ver GAP-002 sobre HTTPS): satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe scripts/check_no_hardcoded_secrets.py passed
    - Artifact: artifacts/EVD-003-command.json
