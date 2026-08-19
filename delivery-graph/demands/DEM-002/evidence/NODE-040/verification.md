# NODE-040 Verification

Node: E2E Playwright da jornada completa de assinatura contra o stack real com Mailpit
Verified: 2026-08-19T16:29:13.052Z

## Required evidence

- docker-compose.test.yml sobe API + Postgres + MinIO + Mailpit e o E2E roda contra esses servicos reais: satisfied
  - EVD-001 [manual]: docker-compose.test.yml sobe postgres, minio, mailpit, api e web(Caddy). Os cinco containers em execucao, /api/health devolvendo database:ok e storage:ok, Mailpit respondendo. O alvo do Playwright e a SPA construida e servida pelo Caddy, nao um servidor de desenvolvimento.
    - Artifact: artifacts/EVD-001-PROOF-e2e-jornada-completa.txt
- O teste cobre registro da rubrica -> upload de PDF -> marcacao da area -> e-mail recebido no Mailpit -> assinatura com senha -> etapa visivel na linha do tempo: satisfied
  - EVD-002 [manual]: 6 testes em serie cobrindo a jornada inteira: rubrica desenhada com o mouse no canvas, PDF de duas paginas enviado ao MinIO, area marcada por arrasto sobre a pagina 2 renderizada pelo pdfjs, e-mail lido do Mailpit, assinatura confirmada por senha (com senha errada testada antes) e a etapa 'signed' visivel na linha do tempo da pasta da obra. 6 passed.
    - Artifact: artifacts/EVD-002-playwright-resultado.json
- O link do e-mail e extraido do Mailpit e realmente abre a tela de assinatura correta: satisfied
  - EVD-003 [manual]: O corpo da mensagem e lido pela API do Mailpit; o link e extraido por regex e conferido contra o id do documento. A navegacao chega anonima, passa pelo login e retorna a tela de assinatura daquele documento — nao a raiz.
    - Artifact: artifacts/EVD-003-PROOF-e2e-jornada-completa.txt
- O download apos a assinatura devolve PDF carimbado e o hash do objeto original segue inalterado: satisfied
  - EVD-004 [manual]: O SHA-256 do PDF enviado e comparado ao que a API registrou na versao (identicos). Depois da assinatura, o download devolve application/pdf com hash DIFERENTE do original — o carimbo e derivado — enquanto a versao continua sendo a 1 e a solicitacao consta como assinada.
    - Artifact: artifacts/EVD-004-PROOF-e2e-jornada-completa.txt
- Nenhuma evidencia deste no e produzida com a fronteira HTTP simulada (licao do NODE-015: execucao mockada nao vale como smoke): satisfied
  - EVD-005 [manual]: O arquivo e2e/jornada-de-assinatura.spec.ts nao contem vi.mock nem stub algum: Chrome real, PostgreSQL real com migracoes aplicadas, MinIO real e SMTP real. E o unico lugar onde o traco no canvas, o PDF renderizado pelo pdfjs e o retangulo desenhado com o mouse sao efetivamente exercitados.
    - Artifact: artifacts/EVD-005-PROOF-e2e-jornada-completa.txt
- Relatorio do Playwright anexado como artefato de evidencia: satisfied
  - EVD-006 [manual]: Relatorio JSON do Playwright anexado, mais o transcrito da execucao com os seis casos.
    - Artifact: artifacts/EVD-006-playwright-resultado.json
