# NODE-014 Verification

Node: Observabilidade: health check com estado de DB e MinIO + structlog em toda a app
Verified: 2026-07-03T19:30:35.770Z

## Required evidence

- pytest: /health retorna ok quando DB e MinIO respondem: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_observability.py -k ok_when_dependencies -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: /health reporta unhealthy quando uma dependencia esta indisponivel: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_observability.py -k unhealthy_when -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: logs sao emitidos em formato estruturado (structlog): satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_observability.py -k structured_json -q passed
    - Artifact: artifacts/EVD-003-command.json
