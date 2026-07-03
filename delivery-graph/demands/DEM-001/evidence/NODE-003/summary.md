# NODE-003 Evidence

Node: Usuarios e papeis: CRUD com RBAC (Admin/Diretor/Engenheiro/Financeiro), admin-only

## Items

- EVD-001 [command] satisfies `pytest: admin cria usuario com papel; nao-admin recebe 403`: .venv/Scripts/pytest.exe tests/test_users.py -k admin_creates or non_admin or unauthenticated -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: papel invalido e rejeitado na validacao`: .venv/Scripts/pytest.exe tests/test_users.py -k invalid_role -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: usuario desativado nao consegue autenticar`: .venv/Scripts/pytest.exe tests/test_users.py -k deactivated -q passed
  - Artifact: artifacts/EVD-003-command.json
