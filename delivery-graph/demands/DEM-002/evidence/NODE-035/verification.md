# NODE-035 Verification

Node: Visualizador de PDF com marcacao de area: pdfjs-dist sob demanda + retangulo + normalizacao de coordenadas
Verified: 2026-08-19T14:31:57.807Z

## Required evidence

- Desenhar um retangulo na pagina 2 e escolher um signatario cria solicitacao pendente vinculada a versao atual: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura -t solicitar passed
    - Artifact: artifacts/EVD-001-command.json
- O quadrado cai no mesmo ponto da pagina em qualquer nivel de zoom (coordenadas normalizadas e nao pixels de tela): satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura -t coordenadas passed
    - Artifact: artifacts/EVD-002-command.json
- Documento que nao e PDF nao oferece a acao de solicitar assinatura: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura -t tipos nao-PDF passed
    - Artifact: artifacts/EVD-003-command.json
- pdfjs-dist e carregado sob demanda e nao entra no chunk inicial (comprovado no relatorio de bundle): satisfied
  - EVD-004 [manual]: Build de producao separa pdf-*.js (127.39 kB gzip) e pdf.worker.min-*.mjs do chunk inicial index-*.js (84.34 kB gzip). Ligar o visualizador fez o chunk inicial crescer de 82.35 para 84.34 kB — apenas o codigo do componente; a dependencia de 127 kB ficou fora, carregada so ao abrir um PDF.
    - Artifact: artifacts/EVD-004-PROOF-pdfjs-fora-do-chunk-inicial.txt
- A area de assinatura pode ser posicionada e confirmada apenas com teclado: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura -t teclado passed
    - Artifact: artifacts/EVD-005-command.json
- Estados de carga do PDF e de falha ao carregar sao distintos e acionaveis: satisfied
  - EVD-006 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/assinatura -t estados do documento passed
    - Artifact: artifacts/EVD-006-command.json
