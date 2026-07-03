# NODE-007 Evidence

Node: Versionamento de documentos: nova versao por re-upload, retencao das anteriores, reset de status

## Items

- EVD-001 [command] satisfies `pytest: re-upload incrementa versao e preserva o objeto da versao anterior`: .venv/Scripts/pytest.exe tests/test_versioning.py -k increments_and_preserves -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: nova versao reseta o status para Enviado`: .venv/Scripts/pytest.exe tests/test_versioning.py -k resets_status -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: aprovacao registrada refere-se a versao aprovada`: .venv/Scripts/pytest.exe tests/test_versioning.py -k refers_to_approved -q passed
  - Artifact: artifacts/EVD-003-command.json
