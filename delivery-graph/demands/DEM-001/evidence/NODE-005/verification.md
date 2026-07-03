# NODE-005 Verification

Node: Documentos: metadados (id, nome, obra_id, categoria, status, criado_por, criado_em) e categorias
Verified: 2026-07-03T18:50:01.055Z

## Required evidence

- pytest: criar documento persiste campos e associa a obra existente: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_documents.py -k persists_fields -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: categoria fora da lista permitida e rejeitada: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_documents.py -k invalid_category -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: documento nasce com status Enviado e criado_por = usuario autenticado: satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_documents.py -k starts_enviado -q passed
    - Artifact: artifacts/EVD-003-command.json
