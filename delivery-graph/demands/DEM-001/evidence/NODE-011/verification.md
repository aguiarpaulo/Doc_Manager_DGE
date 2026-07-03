# NODE-011 Verification

Node: Exclusao soft-delete restrita ao Admin e auditada
Verified: 2026-07-03T19:17:07.032Z

## Required evidence

- pytest: apenas admin exclui; demais papeis recebem 403: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_soft_delete.py -k only_admin -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: soft-delete marca documento como removido sem apagar objeto/versoes: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_soft_delete.py -k retains_versions -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: documento removido some de listagens/buscas padrao e o evento e auditado: satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_soft_delete.py -k hidden_and -q passed
    - Artifact: artifacts/EVD-003-command.json
