# NODE-004 Evidence

Node: Obras, atribuicao N:N usuario-obra e enforcement de escopo por papel

## Items

- EVD-001 [command] satisfies `pytest: admin cria/edita obra; nao-admin recebe 403`: .venv/Scripts/pytest.exe tests/test_obras.py -k creates_and_edits or non_admin -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: admin atribui/remove obra de um usuario`: .venv/Scripts/pytest.exe tests/test_obras.py -k assigns_and_unassigns -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: engenheiro/financeiro so acessam obras atribuidas (403/404 fora do escopo)`: .venv/Scripts/pytest.exe tests/test_obras.py -k only_see_assigned -q passed
  - Artifact: artifacts/EVD-003-command.json
- EVD-004 [command] satisfies `pytest: diretor e admin acessam todas as obras independentemente de atribuicao`: .venv/Scripts/pytest.exe tests/test_obras.py -k see_all_obras -q passed
  - Artifact: artifacts/EVD-004-command.json
