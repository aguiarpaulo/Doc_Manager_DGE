# NODE-045 — Documento renderizado e área destacada na tela de assinatura

**Demanda:** DEM-003 · **Track:** TRK-lacunas-ui · **Requisito:** REQ-036
**Contrato: 5/5** · fecha a `TRK-lacunas-ui` · itens em `evidence.json` e `verification.md`

## O que entrou

A tela de assinatura passou a **mostrar o documento**. Até aqui ela pedia uma
senha para assinar algo que a pessoa não podia ler — que é a lacuna que o GAP-008
nomeou.

| Arquivo | Mudança |
|---|---|
| `frontend/src/features/assinatura/AssinarDocumentoPage.tsx` | baixa a versão, despacha por content type, monta `areaMarcada` |
| `frontend/src/features/assinatura/VisualizadorPdf.tsx` | prop `paginaInicial` |
| `frontend/src/features/assinatura/AssinarDocumentoPage.test.tsx` | 5 testes (`describe("documento renderizado")`) |
| `frontend/src/features/assinatura/acessibilidade.test.tsx` | duplos de pdfjs e `baixarVersao` |

`vitest`: **208 passando**, `tsc`, `eslint` e `vite build` limpos.

## Reaproveitar o visualizador, não escrever um segundo

O item 1 pede explicitamente o `VisualizadorPdf` do NODE-035, e não um componente
novo. A diferença entre as duas telas é de **modo**, não de natureza: lá se marca
a área, aqui se lê. Isso virou `aoMarcar={() => undefined}` — quem assina lê, não
remarca — e uma prop nova, `paginaInicial`, para o documento abrir já na página
onde a assinatura foi pedida. Fazer o signatário procurar seria um defeito de
usabilidade que a tela tem informação suficiente para evitar.

## A rubrica não é desenhada sobreposta, e isso é decisão registrada

O GAP-008 decidiu **destacar a área**, não pré-visualizar a assinatura. O carimbo
continua exclusivo do servidor (NODE-033), pelas duas razões que já estavam no
sistema: a inversão vertical entre o sistema de coordenadas do canvas (origem em
cima) e o do PDF (origem embaixo) acontece **uma única vez**, em
`to_pdf_rect()`; e uma prévia desenhada pelo cliente seria uma segunda
implementação da mesma regra, livre para divergir e para mentir sobre o que será
gravado.

Há teste afirmando a ausência: nenhuma imagem de rubrica é renderizada sobre o
documento.

## O despacho é por content type, nunca por extensão

Igual ao `VisualizadorConteudo` do shell. Documento que não é PDF mostra nome,
versão e página num parágrafo próprio — a tela não quebra e a pessoa ainda sabe o
que está assinando. É o mesmo desenho que o CLAUDE.md descreve para o acervo, e
vale aqui pelo mesmo motivo: `ALLOWED_CONTENT_TYPES` aceita Word e Excel, que não
têm prévia.

## Contrato — 5/5

| # | Item | Evidência |
|---|---|---|
| 1 | Renderiza pelo `VisualizadorPdf` reaproveitado | EVD-001 |
| 2 | Área destacada na página correspondente | EVD-002 |
| 3 | Rubrica não desenhada sobreposta | EVD-003 |
| 4 | Não-PDF não quebra a tela | EVD-004 |
| 5 | pdfjs fora do chunk inicial, com a funcionalidade alcançável | EVD-005 |

## O item 5, que é onde o NODE-035 tinha errado

Aquele nó registrou "um chunk só" como se fosse resultado de otimização. Era
**ausência**: o componente não estava ligado a nenhuma rota, o tree-shaking o
removia inteiro, e o relatório de bundle descrevia um app que não continha o
recurso. Um relatório assim não mede nada.

Agora o `VisualizadorPdf` é alcançável pelo app — a rota
`/documentos/:documentoId/assinar` o renderiza — e a divisão aparece. Saída
gravada em `artifacts/EVD-005-command.json`:

```
frontend/dist/assets/index-C_RAnntj.js            283.84 kB │ gzip:  87.36 kB
frontend/dist/assets/pdf-CT1BSCYW.js              427.30 kB │ gzip: 127.39 kB
frontend/dist/assets/pdf.worker.min-CHFwMXne.mjs  1,262.39 kB
```

O `import("pdfjs-dist")` dinâmico mantém 427 kB (127 kB comprimidos) e o worker
de 1,2 MB **fora** do carregamento inicial. Quem só consulta o acervo nunca os
baixa.

## Um duplo que faltava e a suíte cobrou

Ligar o download do documento nesta tela quebrou `acessibilidade.test.tsx`, que
montava a mesma página sem dublar `baixarVersao` nem o pdfjs. Não é falha da
auditoria de acessibilidade: é que a tela passou a fazer duas coisas novas na
montagem. Os duplos entraram lá, e as 70 asserções de `src/features/assinatura`
voltaram a passar.

## Limitações conhecidas

- **O desenho do PDF em si não é verificado.** O jsdom não tem canvas real; os
  testes provam o despacho, a área destacada e a página inicial, não os pixels.
  Isso pertence ao E2E.
- **Sem zoom nem ajuste de página.** A área destacada é proporcional, então o
  destaque acompanha a escala, mas não há controle de ampliação.
- **O documento é baixado inteiro antes de renderizar** — sem streaming por
  página. Aceitável dentro do limite de ~50 MB do upload.
- **O worker do pdfjs continua acima do `chunkSizeWarningLimit`** de 500 kB. É um
  artefato do próprio pdfjs, carregado sob demanda; baixá-lo exigiria trocar de
  biblioteca.
