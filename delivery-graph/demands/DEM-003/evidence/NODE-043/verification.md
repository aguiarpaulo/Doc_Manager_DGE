# NODE-043 Verification

Node: Tela de perfil: ver trocar e apagar a propria rubrica
Verified: 2026-08-19T18:21:32.993Z

## Required evidence

- A tela mostra a rubrica registrada quando existe e convida ao registro quando nao existe: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t ver a rubrica passed
    - Artifact: artifacts/EVD-001-command.json
- Trocar abre o mesmo canvas do primeiro acesso e a nova rubrica substitui a anterior: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t trocar a rubrica passed
    - Artifact: artifacts/EVD-002-command.json
- Apagar exige senha no Modal reaproveitado do NODE-036 e informa que assinaturas ja feitas continuam validas: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t apagar a rubrica passed
    - Artifact: artifacts/EVD-003-command.json
- Depois de apagar o guarda de rota volta a exigir o registro na proxima rota protegida: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t o guarda volta a exigir o registro passed
    - Artifact: artifacts/EVD-004-command.json
- Nenhuma chamada da tela envia id de usuario; a fronteira so usa /me/signature: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t fronteira de dados passed
    - Artifact: artifacts/EVD-005-command.json
- Estados de carga vazio e erro sao distintos e acionaveis: satisfied
  - EVD-006 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t ver a rubrica passed
    - Artifact: artifacts/EVD-006-command.json
