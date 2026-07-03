# NODE-011 Evidence

Node: Exclusao soft-delete restrita ao Admin e auditada

## Items

- EVD-001 [command] satisfies `pytest: apenas admin exclui; demais papeis recebem 403`: .venv/Scripts/pytest.exe tests/test_soft_delete.py -k only_admin -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: soft-delete marca documento como removido sem apagar objeto/versoes`: .venv/Scripts/pytest.exe tests/test_soft_delete.py -k retains_versions -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: documento removido some de listagens/buscas padrao e o evento e auditado`: .venv/Scripts/pytest.exe tests/test_soft_delete.py -k hidden_and -q passed
  - Artifact: artifacts/EVD-003-command.json
