# NODE-022 Verification

Node: Documentos na SPA: upload + nova versao + download + aprovacao e rejeicao
Verified: 2026-08-15T23:27:06.198Z

## Required evidence

- Upload envia os tipos que a API realmente valida e o campo de obra usa o tipo que o backend espera (licao do NODE-015: campo de texto para UUID quebrou todo upload): satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/documentos.integration.test.ts passed
    - Artifact: artifacts/EVD-001-command.json
- Nova versao cria versao nova e o status volta para enviado: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/documentos.integration.test.ts passed
    - Artifact: artifacts/EVD-003-command.json
- Duplicata por hash na mesma obra e sinalizada e nao re-armazenada silenciosamente: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/documentos.integration.test.ts passed
    - Artifact: artifacts/EVD-004-command.json
- Aprovar e rejeitar respeitam a regra de que o criador nao decide sobre a propria submissao: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/documentos.integration.test.ts passed
    - Artifact: artifacts/EVD-005-command.json
- Transicao invalida de status mostra o erro vindo da API sem quebrar a tela: satisfied
  - EVD-006 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/documentos.integration.test.ts passed
    - Artifact: artifacts/EVD-006-command.json
- Cada tela distingue primeira carga / revalidacao / vazio / erro / sucesso: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/documentos src/features/obras passed
    - Artifact: artifacts/EVD-002-command.json
