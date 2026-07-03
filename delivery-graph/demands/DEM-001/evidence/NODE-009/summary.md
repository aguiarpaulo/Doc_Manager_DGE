# NODE-009 Evidence

Node: Auditoria imutavel de toda acao (login, upload, download, aprovacao, rejeicao, exclusao)

## Items

- EVD-001 [command] satisfies `pytest: cada acao relevante gera registro com autor, acao, alvo e timestamp`: .venv/Scripts/pytest.exe tests/test_audit.py -k are_audited -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: historico de um documento e consultavel em ordem cronologica`: .venv/Scripts/pytest.exe tests/test_audit.py -k chronological -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: registros de auditoria nao podem ser editados/apagados via API`: .venv/Scripts/pytest.exe tests/test_audit.py -k no_mutation -q passed
  - Artifact: artifacts/EVD-003-command.json
