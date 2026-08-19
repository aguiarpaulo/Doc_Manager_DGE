# NODE-037 Verification

Node: Linha do tempo das etapas na pasta da obra
Verified: 2026-08-19T14:58:12.329Z

## Required evidence

- As etapas aparecem na tela do documento em ordem cronologica com autor e horario: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/documentos/LinhaDoTempo.test.tsx -t linha do tempo passed
    - Artifact: artifacts/EVD-001-command.json
- Assinaturas aparecem com o nome do signatario e o horario da assinatura: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/documentos/LinhaDoTempo.test.tsx -t assinatura nomeia o signatario passed
    - Artifact: artifacts/EVD-002-command.json
- Documento sem etapas alem do upload mostra a linha do tempo minima e nao um vazio generico: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/documentos/LinhaDoTempo.test.tsx -t documento recem-enviado passed
    - Artifact: artifacts/EVD-003-command.json
- Estados de carga revalidacao e erro sao distintos: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/documentos/LinhaDoTempo.test.tsx -t estados passed
    - Artifact: artifacts/EVD-004-command.json
