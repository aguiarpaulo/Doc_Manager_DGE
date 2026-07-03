# NODE-003 Verification

Node: Usuarios e papeis: CRUD com RBAC (Admin/Diretor/Engenheiro/Financeiro), admin-only
Verified: 2026-07-03T18:40:30.088Z

## Required evidence

- pytest: admin cria usuario com papel; nao-admin recebe 403: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_users.py -k admin_creates or non_admin or unauthenticated -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: papel invalido e rejeitado na validacao: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_users.py -k invalid_role -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: usuario desativado nao consegue autenticar: satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_users.py -k deactivated -q passed
    - Artifact: artifacts/EVD-003-command.json
