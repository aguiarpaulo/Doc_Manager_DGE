# NODE-019 Verification

Node: Fronteira de dados tipada: transporte unico + contratos da API + validacao de resposta + estados remotos discriminados
Verified: 2026-08-15T22:41:52.044Z

## Required evidence

- Uma unica funcao de transporte resolve URL-base + token + cabecalhos + erros uniformes e suporta AbortSignal: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/http.test.ts passed
    - Artifact: artifacts/EVD-001-command.json
- Resposta 204 e resposta nao-JSON sao tratadas sem presumir corpo JSON: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/http.test.ts -t respostas sem corpo JSON passed
    - Artifact: artifacts/EVD-002-command.json
- Dados externos relevantes sao validados em runtime e nao apenas tipados: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/contracts.test.ts passed
    - Artifact: artifacts/EVD-003-command.json
- RemoteState discriminado distingue loading / revalidating / empty / error / success: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/useApiData.test.tsx passed
    - Artifact: artifacts/EVD-004-command.json
- Erros de autenticacao autorizacao validacao conflito e rede sao diferenciados na fronteira: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/http.test.ts -t taxonomia de erros passed
    - Artifact: artifacts/EVD-005-command.json
- A regra de lint falha quando um componente chama fetch diretamente (comprovado por violacao proposital): satisfied
  - EVD-006 [manual]: Com a fronteira real em src/data/http.ts (duas chamadas fetch), eslint passa (exit 0); o mesmo codigo em src/features/ reprova com no-restricted-globals (exit 1). A regra distingue o local da chamada.
    - Artifact: artifacts/EVD-006-PROOF-fetch-only-in-boundary.txt
