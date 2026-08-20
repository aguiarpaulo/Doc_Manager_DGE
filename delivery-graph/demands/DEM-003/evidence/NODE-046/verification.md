# NODE-046 Verification

Node: Acessibilidade das telas alteradas
Verified: 2026-08-19T18:41:34.350Z

## Required evidence

- A confirmacao de exclusao da rubrica move o foco para dentro do Modal prende Tab e restaura o foco ao fechar: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t dialogo de exclusao da rubrica passed
    - Artifact: artifacts/EVD-001-command.json
- A auditoria com axe nao acusa violacao na tela de perfil nem na tela de assinatura alterada: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t auditoria com axe passed
    - Artifact: artifacts/EVD-002-command.json
- A jornada de recusa e concluida somente com teclado: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t recusa do inicio ao fim sem usar o mouse passed
    - Artifact: artifacts/EVD-003-command.json
- Qualquer token de cor novo entra na lista de combinacoes aprovadas e atende WCAG AA pela formula (o axe nao verifica contraste sob jsdom): satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t contraste dos tokens passed
    - Artifact: artifacts/EVD-004-command.json
