# NODE-034 Verification

Node: Registro da rubrica no primeiro acesso: canvas + guard de rota + aviso de coleta
Verified: 2026-08-19T14:11:32.335Z

## Required evidence

- Usuario sem rubrica e redirecionado a tela de registro em qualquer rota protegida que tente abrir: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/rubrica -t guarda de rubrica passed
    - Artifact: artifacts/EVD-001-command.json
- Canvas vazio nao permite salvar e informa o motivo: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/rubrica -t canvas vazio passed
    - Artifact: artifacts/EVD-002-command.json
- Apos salvar o usuario segue para o destino que tentava acessar: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/rubrica -t salvar passed
    - Artifact: artifacts/EVD-003-command.json
- Usuario que ja possui rubrica nunca ve essa tela: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/rubrica -t nao aparece para quem ja tem rubrica passed
    - Artifact: artifacts/EVD-004-command.json
- Aviso de coleta explica o que e guardado e para que antes do desenho: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/rubrica -t aviso de coleta passed
    - Artifact: artifacts/EVD-005-command.json
- O canvas funciona com mouse e com ponteiro de toque/caneta: satisfied
  - EVD-006 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/rubrica -t ponteiros passed
    - Artifact: artifacts/EVD-006-command.json
