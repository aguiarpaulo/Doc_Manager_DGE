# NODE-004 Verification

Node: Obras, atribuicao N:N usuario-obra e enforcement de escopo por papel
Verified: 2026-07-03T18:45:05.169Z

## Required evidence

- pytest: admin cria/edita obra; nao-admin recebe 403: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_obras.py -k creates_and_edits or non_admin -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: admin atribui/remove obra de um usuario: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_obras.py -k assigns_and_unassigns -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: engenheiro/financeiro so acessam obras atribuidas (403/404 fora do escopo): satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_obras.py -k only_see_assigned -q passed
    - Artifact: artifacts/EVD-003-command.json
- pytest: diretor e admin acessam todas as obras independentemente de atribuicao: satisfied
  - EVD-004 [command]: .venv/Scripts/pytest.exe tests/test_obras.py -k see_all_obras -q passed
    - Artifact: artifacts/EVD-004-command.json
