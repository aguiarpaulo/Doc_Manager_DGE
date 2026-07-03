# NODE-008 Verification

Node: Fluxo de aprovacao (Enviado/Em analise/Aprovado/Rejeitado) com permissoes e sem self-approval
Verified: 2026-07-03T19:01:44.125Z

## Required evidence

- pytest: diretor/admin transitam para Em analise e Aprovado/Rejeitado; engenheiro/financeiro recebem 403: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_approval.py -k move_through or reject_after or cannot_approve -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: usuario nao pode aprovar documento cujo criado_por e ele mesmo: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_approval.py -k approve_own -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: transicoes invalidas de status sao rejeitadas: satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_approval.py -k invalid_transition -q passed
    - Artifact: artifacts/EVD-003-command.json
