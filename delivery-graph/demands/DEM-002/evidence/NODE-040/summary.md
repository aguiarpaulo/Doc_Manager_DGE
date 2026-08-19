# NODE-040 — E2E da jornada de assinatura

**Demanda:** DEM-002 · **Track:** TRK-signature-ui · **Requisito:** REQ-028
**Contrato: 6/6** · **Último nó da DEM-002.**

## O que entrou

| Arquivo | Papel |
|---|---|
| `docker-compose.test.yml` | postgres + minio + **mailpit** + api + web |
| `frontend/playwright.config.ts` | Alvo: a SPA construída e servida pelo Caddy |
| `frontend/e2e/jornada-de-assinatura.spec.ts` | 6 testes em série |

**6 passed** em ~18s.

## Onde o "não verificado em jsdom" finalmente foi verificado

Ao longo da fase 2 registrei repetidamente que certas coisas só se provariam em
navegador. Aqui elas foram:

- **o traço no canvas** — desenhado com `page.mouse`, e é ele que habilita o
  botão de salvar;
- **o PDF renderizado pelo pdfjs** — o snapshot de falha de uma tentativa
  intermediária mostrou os canvases das duas páginas e as camadas de marcação,
  provando que o chunk sob demanda carrega e desenha;
- **o retângulo desenhado com o mouse** sobre a página 2;
- **o e-mail de verdade**, lido da API do Mailpit;
- **o PDF carimbado**, baixado e comparado por hash.

Nenhum `vi.mock`, nenhum stub de canvas, nenhum pdfjs simulado. É a lição do
NODE-015 aplicada ao pé da letra.

## Dois bugs de produção que só o PostgreSQL real revelou

A suíte inteira passava contra SQLite. Subir o stack expôs **dois defeitos na
migração `d4e5f6a7b8c9`** que teriam quebrado qualquer deploy:

1. **`type "signature_request_status" already exists`** — a migração criava o
   ENUM explicitamente e o `create_table` o criava de novo. A migração inicial
   nunca fez isso; eu introduzi o padrão errado.
2. **Rótulos do ENUM em minúsculas.** O SQLAlchemy persiste o **nome** do membro,
   não o valor: `SignatureRequestStatus.PENDENTE` chega ao banco como
   `"PENDENTE"`. Com o tipo aceitando só `'pendente'`, **todo INSERT teria
   falhado** em produção — e o SQLite não pega isso, porque monta o CHECK a partir
   do mesmo enum e fica internamente consistente.

Também corrigi um `\n` literal que eu havia deixado no `Dockerfile` ao acrescentar
`pypdf` e `reportlab` — o build da imagem falhava com "No matching distribution
found for n". O `tests/test_container_build.py` já havia apontado a ausência das
dependências; a forma como as adicionei é que estava quebrada.

## O que o teste prova sobre o carimbo

O SHA-256 do PDF enviado é comparado ao que a API registrou na versão: idênticos.
Depois da assinatura, o download devolve `application/pdf` com hash **diferente** —
o carimbo é derivado — enquanto a versão continua sendo a 1 e a solicitação consta
como `assinada`. Ou seja: o entregue muda, o guardado não.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Stack real com Mailpit | EVD-001 |
| 2 | Jornada completa coberta | EVD-002 |
| 3 | Link do e-mail abre a tela certa | EVD-003 |
| 4 | PDF carimbado, original intacto | EVD-004 |
| 5 | Nada simulado | EVD-005 |
| 6 | Relatório anexado | EVD-006 |

## Três correções no próprio teste

**O login era atropelado.** O helper clicava em "Entrar" e retornava; o `goto`
seguinte descartava a sessão, porque o access token vive só em memória e o refresh
acabara de ser gravado. Passou a esperar o formulário sumir.

**O signatário era reaproveitado entre execuções.** O stack persiste, então na
segunda rodada o usuário já tinha rubrica e a etapa que o teste existe para provar
não acontecia. Agora o signatário é único por execução.

**`getByLabel("Página")` casava 5 elementos** — o seletor e os quatro
`aria-label` das páginas e camadas. Resolvido com `{ exact: true }`.

## Limitações conhecidas

- **Só Chromium.** Firefox e WebKit não foram instalados nem exercitados.
- **O stack de teste não é reiniciado entre execuções.** Os testes convivem com
  isso usando identificadores únicos, mas uma execução limpa exige
  `down -v` manual.
- **Não há verificação visual do carimbo.** O teste confere que o PDF baixado
  difere do original e que a solicitação está assinada; que a rubrica esteja
  *no lugar certo da página* é coberto pelos testes de coordenada do NODE-033,
  não por comparação de imagem.
- **Sem execução em CI** — o repositório continua sem pipeline.
- **Zoom de 200% e leitor de tela** seguem não verificados.
