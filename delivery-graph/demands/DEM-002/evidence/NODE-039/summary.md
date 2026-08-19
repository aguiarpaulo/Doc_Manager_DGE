# NODE-039 — Acessibilidade da jornada de assinatura

**Demanda:** DEM-002 · **Track:** TRK-signature-ui · **Requisito:** REQ-030 (`should`)
**Depende de:** NODE-036, NODE-037 (`done`) · **Contrato: 5/5**

## O que entrou

`features/assinatura/acessibilidade.test.tsx` (20 testes) e
`test/contraste.ts`, mais `axe-core` como dependência de desenvolvimento.

**183 testes** no frontend, tudo limpo.

## O axe não verifica contraste sob jsdom — e eu não fingi que verificava

A regra `color-contrast` do axe depende de renderização real e é **desativada
automaticamente** em jsdom. Rodar o axe e declarar "sem violação de contraste"
seria afirmação vazia — exatamente o tipo de evidência que este projeto já
aprendeu a recusar (NODE-015).

Então a cobertura é em três camadas, cada uma dizendo o que de fato prova:

1. **axe** sobre as telas renderizadas — pega rótulo ausente, papel errado,
   `aria-*` inválido. Roda em três alvos: tela de assinatura, tela de rubrica e o
   **modal no portal** (auditado em `document.body`, porque é lá que ele vive).
2. **Contraste calculado dos tokens**, pela fórmula da WCAG 2.1, sobre **10
   combinações aprovadas** — que é o que a §12.4 pede: pares de token, não cores
   isoladas. Inclui a verificação de que o acento institucional mantém **7:1 sobre
   branco**, a decisão registrada quando a identidade veio do tema Streamlit.
3. **Teclado** exercitado como interação real.

## A jornada por teclado é percorrida de verdade

O teste tabula até o botão sem clicar em nada, abre o diálogo com Enter, digita a
senha e confirma — tudo por teclado, verificando ao final que a API foi chamada.

E há verificação de que `:focus-visible` declara um contorno de 2px: a §12.2 proíbe
remover o foco visível sem substituto melhor.

## Cor nunca é o único sinal

- **Item selecionado da lista:** `aria-current` (programático) + borda lateral +
  peso de fonte.
- **Área marcada no PDF:** borda **tracejada** além do preenchimento.
- **`prefers-reduced-motion`** respeitado, com animações reduzidas a 0,01ms.

Os três são verificados lendo o CSS, porque é onde a garantia mora.

## Contrato — 5/5

| # | Item | Evidência |
|---|---|---|
| 1 | Jornada só com teclado | EVD-002 |
| 2 | Modal move e restaura o foco | EVD-001 |
| 3 | Controles por ícone com nome acessível | EVD-003 |
| 4 | Auditoria sem violação (axe + contraste) | EVD-004, EVD-005 |
| 5 | Estados não dependem só de cor; movimento reduzido | EVD-006 |

## Um bug de portabilidade que o registrador de evidência expôs

Os testes liam o CSS com `readFileSync(resolve(process.cwd(), ...))`. Isso
funcionava rodando de dentro de `frontend/`, mas **o registrador de evidência
invoca o vitest da raiz do repositório** com `--root frontend` — e o vitest muda a
raiz do projeto, não o `cwd` do processo. Resultado: `ENOENT`.

Troquei por imports `?raw` do Vite, que resolvem pelo grafo de módulos e
independem de onde o comando foi disparado. É mais correto de qualquer forma, e só
apareceu porque a evidência é executada de fora.

## Limitações conhecidas

- **Contraste é verificado nos tokens, não na tela renderizada.** Um componente
  que combine tokens de um jeito não previsto — texto secundário sobre o fundo de
  ação, por exemplo — não é pego. A lista de 10 combinações é o contrato; ampliá-la
  é barato quando surgir um par novo.
- **Só o tema claro é verificado.** O bloco de tokens escuro existe e é lido pelo
  `lerTokens` apenas no `:root`; auditar o par escuro é uma extensão pequena e não
  foi pedida.
- **A auditoria cobre a jornada de assinatura**, não todas as telas do sistema.
  Administração, upload e shell não passam pelo axe aqui.
- **Nada é verificado em navegador real** — zoom de 200%, leitor de tela e ordem
  de foco com CSS aplicado só se provam no NODE-040 e além.
