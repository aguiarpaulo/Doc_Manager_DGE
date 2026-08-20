# NODE-044 Verification

Node: Recusar solicitacao com justificativa na tela de assinatura
Verified: 2026-08-19T18:21:34.074Z

## Required evidence

- O botao de recusar aparece somente para o signatario indicado da pendencia: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t nao oferece recusar a quem nao e o signatario indicado passed
    - Artifact: artifacts/EVD-001-command.json
- Justificativa vazia ou so com espacos mantem o envio desabilitado e explica o motivo: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t exige motivo nao vazio passed
    - Artifact: artifacts/EVD-002-command.json
- Apos recusar a pendencia sai da tela e a etapa aparece na linha do tempo com o motivo: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t recusar passed
    - Artifact: artifacts/EVD-003-command.json
- O erro devolvido pela API e mostrado sem apagar o texto ja digitado: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t sem apagar o texto ja digitado passed
    - Artifact: artifacts/EVD-004-command.json
- O botao fica desabilitado durante o envio impedindo recusa duplicada: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t desabilita o envio durante a operacao passed
    - Artifact: artifacts/EVD-005-command.json
