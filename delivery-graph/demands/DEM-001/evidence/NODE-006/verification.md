# NODE-006 Verification

Node: Upload para MinIO com metadados (tamanho, tipo, hash SHA-256, versao) e validacao tipo/tamanho/duplicado
Verified: 2026-07-03T18:54:56.125Z

## Required evidence

- pytest: upload PDF/PNG/JPG valido persiste objeto no MinIO e metadados: satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_uploads.py -k persists_object -q passed
    - Artifact: artifacts/EVD-003-command.json
- pytest: tipo nao permitido ou arquivo acima de 50MB e rejeitado: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_uploads.py -k disallowed_type or oversized -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: hash SHA-256 identico na mesma obra e sinalizado como duplicado: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_uploads.py -k duplicate_hash -q passed
    - Artifact: artifacts/EVD-002-command.json
