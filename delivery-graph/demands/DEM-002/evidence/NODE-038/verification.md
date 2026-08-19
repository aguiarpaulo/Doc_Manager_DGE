# NODE-038 Verification

Node: Painel aguardando minha assinatura
Verified: 2026-08-19T15:17:30.750Z

## Required evidence

- O painel lista somente pendencias dirigidas ao proprio usuario autenticado: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/MinhasPendencias.test.tsx -t lista o que espera or sem informar id passed
    - Artifact: artifacts/EVD-001-command.json
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_requests.py -q -k my_pending_queue or queue_path_takes_no_user_id or encerrada_request_leaves or queue_requires_authentication passed
    - Artifact: artifacts/EVD-002-command.json
- Cada item leva direto a tela de assinatura do documento correspondente: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/MinhasPendencias.test.tsx -t leva a tela de assinatura or pagina e a data passed
    - Artifact: artifacts/EVD-003-command.json
- Sem pendencias o painel mostra estado vazio proprio e nao um erro: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/MinhasPendencias.test.tsx -t estado vazio proprio or distingue falha or primeira carga passed
    - Artifact: artifacts/EVD-004-command.json
