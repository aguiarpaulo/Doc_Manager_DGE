# NODE-024 Verification

Node: Deploy da SPA na mesma origem: build multi-stage no Docker + Caddy servindo estatico ao lado da API
Verified: 2026-08-15T23:53:15.366Z

## Required evidence

- docker compose up serve SPA e API na mesma origem sem necessidade de CORS: satisfied
  - EVD-001 [manual]: Stack real de pe: postgres+minio+api+web. GET / devolve a SPA (text/html) e GET /api/health devolve {database:ok, storage:ok} na MESMA origem https://localhost. Nenhuma requisicao atravessa origem, logo nao ha CORS.
    - Artifact: artifacts/EVD-001-PROOF-smoke-stack-real.txt
- Acesso direto a uma rota filha funciona e atualizar o navegador nela tambem: satisfied
  - EVD-002 [manual]: C:/Program Files/Git/administracao, /obras/{id} e /obras/{id}/documentos/{id} devolvem HTTP 200 text/html por acesso direto, via try_files {path} /index.html no Caddy. Sem o fallback, um F5 em rota filha daria 404 do servidor de arquivos.
    - Artifact: artifacts/EVD-002-PROOF-smoke-stack-real.txt
- Chamada de API nao duplica o prefixo do caminho-base: satisfied
  - EVD-003 [manual]: O bundle servido tem 0 ocorrencias de '/api/api' e 1 da base '/api'. O Caddy usa handle_path /api/* que remove o prefixo antes do reverse_proxy, e a API monta os routers na raiz; a jornada completa respondeu 200/201 em todos os endpoints.
    - Artifact: artifacts/EVD-003-PROOF-smoke-stack-real.txt
- Build falha e nao publica quando a checagem de tipos falha: satisfied
  - EVD-004 [manual]: Erro de tipo proposital em frontend/src derrubou 'docker compose build web' no estagio Node: tsc TS2322, exit code 2, 'failed to solve'. Nenhuma imagem foi exportada.
    - Artifact: artifacts/EVD-004-PROOF-build-falha-com-erro-de-tipo.txt
- Smoke manual contra o stack real percorre login e listagem de documentos (nao vale execucao com a API simulada): satisfied
  - EVD-005 [manual]: Jornada atraves do Caddy com servicos reais: login -> /auth/me -> criar obra -> criar documento (obra_id UUID) -> upload de PDF ao MinIO (hash SHA-256 devolvido) -> listagem da obra (1 documento) -> download HTTP 200 application/pdf 41 bytes. Nada simulado.
    - Artifact: artifacts/EVD-005-PROOF-smoke-stack-real.txt
