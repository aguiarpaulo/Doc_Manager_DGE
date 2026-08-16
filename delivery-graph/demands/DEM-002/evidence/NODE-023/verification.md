# NODE-023 Verification

Node: Administracao na SPA: usuarios e obras incluindo papeis ativar desativar arquivar e restaurar
Verified: 2026-08-15T23:37:07.347Z

## Required evidence

- A area so aparece para papel administrador conforme GET /auth/me: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/admin/AdminPage.test.tsx -t acesso a area administrativa passed
    - Artifact: artifacts/EVD-001-command.json
- A area continua acessivel com zero obras cadastradas: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/admin/AdminPage.test.tsx -t zero obras cadastradas passed
    - Artifact: artifacts/EVD-002-command.json
- Restaurar obra arquivada funciona mesmo quando ela era a unica obra do sistema: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/admin/AdminPage.test.tsx -t unica do sistema passed
    - Artifact: artifacts/EVD-003-command.json
- Administrador recebe 403 ao tentar desativar a si mesmo ou remover o proprio papel e a UI explica o motivo: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/admin.integration.test.ts passed
    - Artifact: artifacts/EVD-004-command.json
- O controle de ativar/desativar reflete o estado do usuario selecionado sem exigir novo envio: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/admin/AdminPage.test.tsx -t acompanha a situacao do usuario passed
    - Artifact: artifacts/EVD-005-command.json
