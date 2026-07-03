# NODE-005 Evidence

Node: Documentos: metadados (id, nome, obra_id, categoria, status, criado_por, criado_em) e categorias

## Items

- EVD-001 [command] satisfies `pytest: criar documento persiste campos e associa a obra existente`: .venv/Scripts/pytest.exe tests/test_documents.py -k persists_fields -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: categoria fora da lista permitida e rejeitada`: .venv/Scripts/pytest.exe tests/test_documents.py -k invalid_category -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: documento nasce com status Enviado e criado_por = usuario autenticado`: .venv/Scripts/pytest.exe tests/test_documents.py -k starts_enviado -q passed
  - Artifact: artifacts/EVD-003-command.json
