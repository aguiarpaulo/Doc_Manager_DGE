# NODE-033 — Carimbo do PDF sob demanda

**Demanda:** DEM-002 · **Track:** TRK-signature-api · **Requisito:** REQ-025
**Depende de:** NODE-029 (`done`) · **Contrato: 7/7**
**Fecha a `TRK-signature-api` — a API de assinatura está completa.**

## O que entrou

`app/services/pdf_stamp.py` (pypdf + reportlab), carimbo ligado ao download em
`app/api/documents.py`, e a validação de página existente que ficara pendente no
NODE-027.

**223 testes** (16 novos), `ruff` limpo.

## A inversão do eixo acontece exatamente uma vez

Um canvas mede do **topo**; um PDF mede da **base**. `to_pdf_rect` é função pura
justamente para poder ser conferida contra números conhecidos em vez de olhar um
visualizador e achar que está certo:

```
retângulo colado no topo (y=0), altura 10%, página de 800pt
→ borda inferior no PDF a 720pt do fundo
retângulo colado na base (y=0.9), altura 10%
→ y = 0
```

E o posicionamento usa **as dimensões reais de cada página**, lidas do próprio
PDF. Um arquivo que mistura A4 retrato e paisagem recebe a rubrica no ponto
relativo certo em cada uma — há teste com `[A4, landscape(A4), A4]` que confirma
inclusive que a página em paisagem continua em paisagem depois do carimbo.

## O original nunca é tocado

O carimbo é **derivado**, gerado a cada download. O teste compara o SHA-256 da
versão antes e depois de assinar e baixar: idêntico, e os bytes no armazenamento
também. Documento sem assinatura baixa **byte a byte** igual ao enviado — inclusive
`stamp_pdf` devolve o objeto original sem regravar quando não há o que desenhar.

Baixar três vezes não cria versão nem move o status de aprovação.

## Contrato — 7/7

| # | Item | Evidência |
|---|---|---|
| 1 | Download traz a rubrica na página e coordenadas | EVD-001 |
| 2 | Página de conferência com nome, hora e versão | EVD-002 |
| 3 | SHA-256 do original inalterado | EVD-003 |
| 4 | Sem assinatura, download byte a byte | EVD-004 |
| 5 | Não cria versão nem altera aprovação | EVD-005 |
| 6 | Conversão correta com páginas de tamanhos diferentes | EVD-006 |
| 7 | Nenhum binário nativo no container | EVD-007 |

## Três coisas que a suíte pegou

**O teste do container falhou** porque declarei `pypdf` e `reportlab` no
`pyproject.toml` mas não na lista do `Dockerfile`. Esse teste existe exatamente
para isso, e pegou de primeira.

**PDF ilegível virava 500.** Meus PDFs falsos de teste (`b"%PDF-1.4\n..."`) não
são parseáveis, e `page_count` propagava o erro do pypdf. Isso é bug de produção,
não de teste: um arquivo que se diz PDF mas não abre é problema do cliente, então
agora levanta `UnreadablePdf` e vira **400** com mensagem clara. Os testes passaram
a gerar PDFs reais com reportlab (`make_pdf` no conftest).

**Minha asserção media a coisa errada.** Três assinaturas na mesma página
resultavam em uma imagem, não três — o reportlab **deduplica** bytes idênticos num
único XObject. O comportamento estava certo; o teste é que contava XObjects. Passei
a usar rubricas visualmente diferentes, como as de pessoas diferentes realmente
são.

## Pendência do NODE-027 fechada

Marcar a página 99 de um documento de 3 páginas era aceito, porque descobrir a
contagem exigia um leitor de PDF que só chegou agora. `ensure_page_exists` fecha
isso com **400** e mensagem dizendo quantas páginas o documento tem.

## Limitações conhecidas

- **O carimbo é regerado a cada download.** Um PDF grande com muitas assinaturas
  paga esse custo toda vez. Cachear o derivado é otimização óbvia, mas mediria-se
  antes: nenhum requisito fala de desempenho.
- **A página de conferência trunca** se houver mais signatários do que cabem
  (`y < 20mm`). Paginá-la exigiria mais páginas de conferência; hoje corta.
- **A rubrica respeita a proporção** (`preserveAspectRatio`), então uma área muito
  diferente da proporção do desenho deixa espaço vazio em vez de esticar.
- **Sem verificação externa.** A página de conferência é informativa, não um
  mecanismo criptográfico — coerente com a decisão de "controle interno" do
  intake, e não substitui ICP-Brasil.
