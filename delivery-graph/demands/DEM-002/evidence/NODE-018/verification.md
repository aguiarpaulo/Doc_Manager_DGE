# NODE-018 Verification

Node: Scaffold da SPA: Vite + React + TypeScript estrito + Vitest/Testing Library + tokens CSS + caminho-base configuravel
Verified: 2026-08-15T22:26:45.267Z

## Required evidence

- Checagem de tipos passa e o build falha quando ha erro de tipo (comprovado por erro proposital): satisfied
  - EVD-001 [command]: node frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json passed
    - Artifact: artifacts/EVD-001-command.json
  - EVD-005 [manual]: Erro de tipo proposital em src/__proof_type_error.ts interrompeu npm run build com exit 2 no tsc; vite build nao executou. Arquivo removido apos a prova.
    - Artifact: artifacts/EVD-005-PROOF-type-error-fails-build.txt
- Lint passa e a regra que proibe fetch fora da fronteira de dados esta ativa: satisfied
  - EVD-002 [command]: node frontend/node_modules/eslint/bin/eslint.js frontend/src frontend/eslint.config.js passed
    - Artifact: artifacts/EVD-002-command.json
  - EVD-006 [manual]: Mesmo codigo fetch reprovou (exit 1 no-restricted-globals) em src/ e passou (exit 0) em src/data/. A regra distingue o local da chamada e nao o texto.
    - Artifact: artifacts/EVD-006-PROOF-fetch-boundary-rule.txt
- Build de producao gera artefato e emite relatorio de tamanho de bundle: satisfied
  - EVD-004 [command]: node frontend/node_modules/vite/bin/vite.js build frontend passed
    - Artifact: artifacts/EVD-004-command.json
- Vitest + Testing Library executam um teste de exemplo por papel/nome acessivel: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend passed
    - Artifact: artifacts/EVD-003-command.json
- Tokens CSS semanticos definidos em :root com tema claro/escuro por token e nenhuma cor literal no codigo: satisfied
  - EVD-007 [manual]: 53 tokens declarados; 14 tokens de cor nomeados por intencao; tres blocos de tema (:root, prefers-color-scheme dark, data-theme dark). Varredura por hex/rgb/hsl fora de src/styles/index.css: zero ocorrencias.
    - Artifact: artifacts/EVD-007-PROOF-design-tokens.txt
- Aplicacao carrega sob caminho-base configurado e nao apenas em /: satisfied
  - EVD-008 [manual]: Build com VITE_BASE_PATH=/ged/ servido em preview: / redireciona 302, /ged/ serve 200, e /ged/assets/*.js devolve 190674 bytes com MIME text/javascript (arquivo real e nao fallback do index.html de 403 bytes).
    - Artifact: artifacts/EVD-008-PROOF-base-path-subpath.txt
