# NODE-007 Verification

Node: Versionamento de documentos: nova versao por re-upload, retencao das anteriores, reset de status
Verified: 2026-07-03T18:58:32.743Z

## Required evidence

- pytest: re-upload incrementa versao e preserva o objeto da versao anterior: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_versioning.py -k increments_and_preserves -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: nova versao reseta o status para Enviado: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_versioning.py -k resets_status -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: aprovacao registrada refere-se a versao aprovada: satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_versioning.py -k refers_to_approved -q passed
    - Artifact: artifacts/EVD-003-command.json
