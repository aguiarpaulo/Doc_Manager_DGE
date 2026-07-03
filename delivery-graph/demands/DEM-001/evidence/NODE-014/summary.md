# NODE-014 Evidence

Node: Observabilidade: health check com estado de DB e MinIO + structlog em toda a app

## Items

- EVD-001 [command] satisfies `pytest: /health retorna ok quando DB e MinIO respondem`: .venv/Scripts/pytest.exe tests/test_observability.py -k ok_when_dependencies -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: /health reporta unhealthy quando uma dependencia esta indisponivel`: .venv/Scripts/pytest.exe tests/test_observability.py -k unhealthy_when -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: logs sao emitidos em formato estruturado (structlog)`: .venv/Scripts/pytest.exe tests/test_observability.py -k structured_json -q passed
  - Artifact: artifacts/EVD-003-command.json
