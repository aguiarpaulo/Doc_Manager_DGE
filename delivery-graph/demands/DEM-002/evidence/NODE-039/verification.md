# NODE-039 Verification

Node: Acessibilidade da jornada de assinatura: teclado foco contraste e modais
Verified: 2026-08-19T15:34:59.762Z

## Required evidence

- A jornada completa de assinatura e concluida usando somente o teclado: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/acessibilidade.test.tsx -t jornada por teclado passed
    - Artifact: artifacts/EVD-002-command.json
- Abrir um modal move o foco para dentro dele e fecha-lo restaura o foco no elemento anterior: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/AssinarDocumentoPage.test.tsx -t modal de confirmacao passed
    - Artifact: artifacts/EVD-001-command.json
- Todo controle representado apenas por icone tem nome acessivel: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/acessibilidade.test.tsx -t controles por icone passed
    - Artifact: artifacts/EVD-003-command.json
- Auditoria automatizada de acessibilidade nao acusa violacao de contraste nas telas principais: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/acessibilidade.test.tsx -t auditoria com axe passed
    - Artifact: artifacts/EVD-004-command.json
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/acessibilidade.test.tsx -t contraste dos tokens passed
    - Artifact: artifacts/EVD-005-command.json
- Estados nao dependem somente de cor e prefers-reduced-motion e respeitado: satisfied
  - EVD-006 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura/acessibilidade.test.tsx -t cor e movimento passed
    - Artifact: artifacts/EVD-006-command.json
