# NODE-046 — Acessibilidade das telas alteradas

**Demanda:** DEM-003 · **Track:** TRK-acessibilidade · **Requisito:** REQ-039
**Contrato: 4/4** · itens em `evidence.json` e `verification.md`

## O que entrou

A auditoria do NODE-039 estendida às três telas que a DEM-003 mexeu: o perfil da
rubrica, o diálogo de exclusão e o diálogo de recusa.

| Arquivo | Mudança |
|---|---|
| `frontend/src/features/assinatura/acessibilidade.test.tsx` | +11 testes |
| `frontend/src/styles/index.css` | `--color-border-strong`; estilo base de campo |
| `frontend/src/components/ui/modal.css` | borda do diálogo |
| `frontend/src/features/rubrica/rubrica.css` | borda do canvas e da imagem |
| `frontend/src/data/useApiData.ts` | `aguardandoDependencia()` |
| `frontend/src/features/assinatura/AssinarDocumentoPage.tsx` | usa o novo sinal |
| `frontend/src/features/rubrica/PerfilRubricaPage.tsx` | idem |

`vitest`: **220 passando**, `tsc`, `eslint` e `vite build` limpos.

## O achado: a borda do sistema não passava em AA

Escrevi um teste que exige das bordas os **3:1 da WCAG 1.4.11** — o critério que
vale para o que identifica um componente, não os 4,5:1 de texto. `--color-border`
media **1,43:1** no tema claro e **1,57:1** no escuro. Reprovou.

Isso importa mais neste tema do que importaria em outro: com `--radius: 0`, a
borda é o único sinal de onde um campo começa e termina — é o que o CLAUDE.md já
dizia ao explicar por que `--border-width` nunca é zero. Uma borda a 1,43:1 é
quase invisível, e o controle fica sem contorno perceptível.

Também descobri que **campo, select e textarea não tinham estilo nenhum**: usavam
a borda padrão do navegador, que varia entre navegadores e não tem contraste
garantido.

Não decidi sozinho: a identidade visual é decisão sua, e escurecer um token único
mudaria toda divisória do sistema. Você escolheu **dois tokens**, e é o que está
implementado:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--color-border` | `#d3d8de` (1,43:1) | `#3a404b` (1,57:1) | divisória, painel, separador |
| `--color-border-strong` | `#8b939c` (3,11:1) | `#6b7484` (3,46:1) | campo, select, textarea, canvas, imagem da rubrica, modal |

A distinção é semântica e não cosmética: a norma cobre o que **identifica um
controle**, e uma linha que só separa dois blocos de texto não identifica coisa
alguma. Há teste afirmando que os dois tokens têm valores diferentes — se
voltarem a coincidir, a isenção que sustenta o de cima deixa de existir e o teste
de 3:1 passaria a mentir sobre as divisórias.

## O guarda que impede a lista de combinações de envelhecer

O item 4 pede que **token novo** entre na lista aprovada. Uma lista escrita à mão
não cumpre isso sozinha: ela envelhece em silêncio. Então o teste enumera todo
`--color-*` declarado no `:root` e exige que cada um esteja **coberto** por uma
combinação aprovada ou **isento com motivo escrito** (`SEM_TEXTO`). Token novo
que ninguém aprovou nem isentou reprova.

As quatro isenções e seus motivos: `--color-border` (divisória decorativa),
`--color-border-strong` (verificado a 3:1), `--color-focus` (idem),
`--color-action-hover` (estado transitório do link já coberto) e
`--color-overlay` (rgba, escurecimento de fundo, não carrega texto).

## Contrato — 4/4

| # | Item | Evidência | Testes |
|---|---|---|---|
| 1 | Foco entra no Modal de exclusão, Tab preso, foco restaurado | EVD-001 | 4 |
| 2 | axe sem violação no perfil e na tela de assinatura alterada | EVD-002 | 6 |
| 3 | Recusa concluída só com teclado | EVD-003 | 1 |
| 4 | Token de cor novo entra na lista aprovada e atende AA | EVD-004 | 15 |

O item 1 vai além do foco entrar: o teste afirma que ele cai **no campo de
senha** — quem abre o diálogo já pode digitar — e que Escape fecha, devolve o
foco a quem abriu e **não apaga nada**.

O item 3 chega ao botão tabulando, sem clique nenhum, e verifica que o foco cai
no textarea do motivo sem tabulação adicional.

## Um defeito de produção que este nó desenterrou

Ao rodar a suíte inteira, um teste do NODE-045 falhou de forma intermitente com
"Falha inesperada ao carregar." em vez do erro esperado. **Era defeito meu, não
do teste.**

O download do documento depende da versão, que só chega quando o documento
carrega. Eu sinalizei essa espera com `Promise.reject(new Error("sem versao"))` —
e uma rejeição é uma mentira aqui: a tela mostrava uma falha que não aconteceu, a
cada montagem, e essa falsa falha **competia com a falha de verdade** que chegava
depois. Qual das duas o usuário via dependia de qual resolvia primeiro.

A correção é `aguardandoDependencia()`, uma promessa que não se resolve: o estado
fica em `loading`, que é literalmente a verdade — ainda não se sabe o que buscar.
O efeito é abortado quando as dependências mudam. O mesmo padrão errado estava na
tela de perfil (invisível ali, porque o bloco de erro não é renderizado sem
rubrica) e foi corrigido junto.

Entrou teste de regressão afirmando que **nenhum alerta aparece** enquanto a
versão é desconhecida. Ele mira o texto do indicador, não o papel `status`, porque
o guarda de sessão também usa `role="status"` e a consulta por papel era ambígua.

## Limitações conhecidas

- **O axe não verifica contraste sob jsdom** — a regra depende de renderização
  real e é desativada. Por isso o contraste é calculado pela fórmula sobre os
  tokens; declarar "sem violação de contraste" a partir do axe aqui seria vazio.
- **Só o tema claro é medido.** `lerTokens()` lê o bloco `:root`; os valores do
  tema escuro foram conferidos à mão nesta análise, mas não há teste automático.
  Vale para o NODE-039 também — não é regressão, é dívida herdada.
- **A verificação com leitor de tela real não foi feita.** axe e teclado cobrem
  estrutura e navegação, não a experiência de escuta.
- **A borda nova não foi vista em navegador** — só medida. A conferência visual
  do novo contorno de campo cabe ao NODE-047.
