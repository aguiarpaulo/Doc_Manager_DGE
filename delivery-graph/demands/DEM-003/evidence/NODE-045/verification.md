# NODE-045 Verification

Node: Documento renderizado e area destacada na tela de assinatura
Verified: 2026-08-19T18:21:35.069Z

## Required evidence

- A tela de assinatura renderiza o PDF pelo VisualizadorPdf reaproveitado e nao por um componente novo: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t mostra o PDF pelo VisualizadorPdf reaproveitado passed
    - Artifact: artifacts/EVD-001-command.json
- A area marcada para o signatario e destacada na pagina correspondente antes de ele confirmar: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t destaca a area marcada na pagina correspondente passed
    - Artifact: artifacts/EVD-002-command.json
- A rubrica NAO e desenhada sobreposta: o carimbo continua exclusivo do servidor (decisao do GAP-008): satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t nao desenha a rubrica sobreposta passed
    - Artifact: artifacts/EVD-003-command.json
- Documento que nao e PDF continua mostrando nome versao e pagina sem quebrar a tela: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend -t documento que nao e PDF passed
    - Artifact: artifacts/EVD-004-command.json
- pdfjs continua fora do chunk inicial, comprovado com a funcionalidade alcancavel pelo app (licao do NODE-035: com o componente inalcancavel o tree-shaking esconde a divisao e o relatorio mente): satisfied
  - EVD-005 [command]: node frontend/node_modules/vite/bin/vite.js build frontend passed
    - Artifact: artifacts/EVD-005-command.json
