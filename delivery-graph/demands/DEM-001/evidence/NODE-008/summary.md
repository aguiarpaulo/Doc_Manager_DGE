# NODE-008 Evidence

Node: Fluxo de aprovacao (Enviado/Em analise/Aprovado/Rejeitado) com permissoes e sem self-approval

## Items

- EVD-001 [command] satisfies `pytest: diretor/admin transitam para Em analise e Aprovado/Rejeitado; engenheiro/financeiro recebem 403`: .venv/Scripts/pytest.exe tests/test_approval.py -k move_through or reject_after or cannot_approve -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: usuario nao pode aprovar documento cujo criado_por e ele mesmo`: .venv/Scripts/pytest.exe tests/test_approval.py -k approve_own -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: transicoes invalidas de status sao rejeitadas`: .venv/Scripts/pytest.exe tests/test_approval.py -k invalid_transition -q passed
  - Artifact: artifacts/EVD-003-command.json
