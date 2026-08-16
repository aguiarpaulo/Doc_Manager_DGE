# NODE-021 Verification

Node: Shell SEI: obra como processo + lista de documentos a esquerda em ordem de inclusao + documento a direita + barra de acoes + rota compartilhavel
Verified: 2026-08-15T23:02:44.110Z

## Required evidence

- Obra com 3 documentos os exibe do mais antigo para o mais novo: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/obras/ObraShell.test.tsx -t ordem de inclusao passed
    - Artifact: artifacts/EVD-001-command.json
- Selecionar documento na lista o renderiza a direita sem recarregar a pagina: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/obras/ObraShell.test.tsx -t sem recarregar a pagina passed
    - Artifact: artifacts/EVD-002-command.json
- A rota reflete obra e documento de modo que recarregar o navegador restaura a mesma tela: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/obras/ObraShell.test.tsx -t restaura a mesma tela passed
    - Artifact: artifacts/EVD-003-command.json
- Obra sem documentos mostra estado vazio proprio e nao mensagem de erro: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/obras/ObraShell.test.tsx -t estado vazio proprio passed
    - Artifact: artifacts/EVD-004-command.json
- A renderizacao despacha pelo Content-Type devolvido pelo download e nunca pela extensao do arquivo: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/documentos/VisualizadorConteudo.test.tsx passed
    - Artifact: artifacts/EVD-005-command.json
- Regiao de rolagem unica definida; a pagina nao rola horizontalmente: satisfied
  - EVD-006 [manual]: shell.css fixa .shell em 100vh com overflow hidden (a pagina nao rola) e declara exatamente duas regioes rolaveis: .shell__lista (overflow-y auto) e .shell__conteudo (overflow auto). min-width/min-height 0 nos filhos flexiveis; zero ocorrencias de overflow-x e nenhuma largura fixa em px alem da espessura de borda. Confirmacao em pixels fica para o smoke do NODE-024.
    - Artifact: artifacts/EVD-006-PROOF-regiao-de-rolagem.txt
