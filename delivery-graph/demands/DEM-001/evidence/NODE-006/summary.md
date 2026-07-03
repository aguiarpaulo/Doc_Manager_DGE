# NODE-006 Evidence

Node: Upload para MinIO com metadados (tamanho, tipo, hash SHA-256, versao) e validacao tipo/tamanho/duplicado

## Items

- EVD-001 [command] satisfies `pytest: tipo nao permitido ou arquivo acima de 50MB e rejeitado`: .venv/Scripts/pytest.exe tests/test_uploads.py -k disallowed_type or oversized -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: hash SHA-256 identico na mesma obra e sinalizado como duplicado`: .venv/Scripts/pytest.exe tests/test_uploads.py -k duplicate_hash -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: upload PDF/PNG/JPG valido persiste objeto no MinIO e metadados`: .venv/Scripts/pytest.exe tests/test_uploads.py -k persists_object -q passed
  - Artifact: artifacts/EVD-003-command.json
