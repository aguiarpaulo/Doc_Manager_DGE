# NODE-010 Evidence

Node: Busca de documentos por nome, categoria, obra, status e usuario, respeitando escopo

## Items

- EVD-001 [command] satisfies `pytest: busca filtra por cada criterio e por combinacoes`: .venv/Scripts/pytest.exe tests/test_search.py -k each_criterion -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: resultados nunca incluem documentos de obras fora do escopo do usuario`: .venv/Scripts/pytest.exe tests/test_search.py -k out_of_scope -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: busca sem resultados retorna lista vazia (nao erro)`: .venv/Scripts/pytest.exe tests/test_search.py -k no_results -q passed
  - Artifact: artifacts/EVD-003-command.json
