# NODE-020 Verification

Node: Autenticacao na SPA: login + rota protegida + /auth/me + refresh + esqueci minha senha
Verified: 2026-08-15T22:56:23.699Z

## Required evidence

- Login autentica contra a API real e persiste o token fora de armazenamento sensivel indevido: satisfied
  - EVD-006 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/data/live.integration.test.ts passed
    - Artifact: artifacts/EVD-006-command.json
- Rota protegida sem sessao redireciona ao login e retorna ao destino original apos autenticar: satisfied
  - EVD-001 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/auth/auth.test.tsx -t rota protegida passed
    - Artifact: artifacts/EVD-001-command.json
- O papel do usuario vem de GET /auth/me e nao do payload do JWT: satisfied
  - EVD-002 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/auth/auth.test.tsx -t papel do usuario passed
    - Artifact: artifacts/EVD-002-command.json
- Refresh renova o access token sem deslogar o usuario: satisfied
  - EVD-003 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/auth/auth.test.tsx -t refresh na montagem passed
    - Artifact: artifacts/EVD-003-command.json
- Credencial invalida mostra erro acionavel e nao revela se o usuario existe: satisfied
  - EVD-004 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/auth/auth.test.tsx -t credencial invalida passed
    - Artifact: artifacts/EVD-004-command.json
- Testes de componente cobrem sucesso e falha de login sem chamar servico real: satisfied
  - EVD-005 [command]: node frontend/node_modules/vitest/vitest.mjs run --root frontend src/features/auth src/App.test.tsx passed
    - Artifact: artifacts/EVD-005-command.json
