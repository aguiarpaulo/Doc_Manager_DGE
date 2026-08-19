# NODE-036 Verification

Node: Tela de assinatura: confirmacao por senha + retorno do login pelo link do e-mail
Verified: 2026-08-19T14:46:38.307Z

## Required evidence

- Senha correta conclui a assinatura e a rubrica aparece na area marcada com nome e horario: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/AssinarDocumentoPage.test.tsx -t senha correta passed
    - Artifact: artifacts/EVD-001-command.json
- Senha incorreta mantem a pendencia e mostra erro acionavel: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/AssinarDocumentoPage.test.tsx -t senha errada passed
    - Artifact: artifacts/EVD-002-command.json
- O botao de confirmar fica desabilitado durante o envio impedindo assinatura duplicada: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/AssinarDocumentoPage.test.tsx -t desabilita o confirmar or senha vazia passed
    - Artifact: artifacts/EVD-003-command.json
- Abrir o link do e-mail sem sessao passa pelo login e retorna a tela de assinatura do documento correto: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/AssinarDocumentoPage.test.tsx -t link do e-mail passed
    - Artifact: artifacts/EVD-004-command.json
- O modal de confirmacao move o foco para dentro prende Tab e restaura o foco ao fechar: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/AssinarDocumentoPage.test.tsx -t modal de confirmacao passed
    - Artifact: artifacts/EVD-005-command.json
- A senha nunca e registrada em log nem persistida no cliente: satisfied
  - EVD-006 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/AssinarDocumentoPage.test.tsx -t a senha passed
    - Artifact: artifacts/EVD-006-command.json
