# NODE-018 — Scaffold da SPA

**Demanda:** DEM-002 · **Track:** TRK-spa-foundation · **Requisitos:** REQ-027, REQ-028
**Status ao final deste nó:** `review` (a conclusão pertence ao `/dge-verify`)

## O que foi feito

Criado `frontend/` com a fundação da SPA descrita na base de conhecimento
(`docs/base-conhecimento-arquitetura-frontend-web.md`): projeto Vite + React +
TypeScript estrito, harness de testes por comportamento, folha de tokens
semânticos e caminho-base configurável.

Nenhuma rota, provedor ou tela de produto foi criada — isso pertence a
NODE-019 (fronteira de dados) em diante. Este nó entrega apenas o alicerce e,
mais importante, as **travas** que os 21 nós seguintes assumem existir.

## Versões resolvidas

| Pacote | Versão |
|---|---|
| react / react-dom | 19.2 |
| vite | 8.2 |
| typescript | 6.0 |
| vitest | 4.1 |
| eslint | 10.8 |
| typescript-eslint | 8.67 |
| @testing-library/react | 16.3 |

Node 24.15.0 · npm 11.12.1

## Contrato de validação — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Typecheck passa; build falha com erro de tipo | EVD-001 (execução) + EVD-005 (prova negativa) |
| 2 | Lint passa; regra anti-`fetch` ativa | EVD-002 (execução) + EVD-006 (prova nos dois sentidos) |
| 3 | Build gera artefato + relatório de bundle | EVD-009 |
| 4 | Vitest + Testing Library por papel/nome acessível | EVD-003 |
| 5 | Tokens semânticos; nenhuma cor literal | EVD-007 |
| 6 | Carrega sob caminho-base configurado | EVD-008 |

## Comandos executados

```
npm --prefix frontend run typecheck    # tsc --noEmit                    -> exit 0
npm --prefix frontend run lint         # eslint .                        -> exit 0
npm --prefix frontend test             # vitest run    2 passed (2)      -> exit 0
npm --prefix frontend run build        # tsc --noEmit && vite build      -> exit 0
```

Build de produção: `190.67 kB` bruto / **`60.07 kB` gzip**, CSS `1.92 kB` /
`0.68 kB` gzip. Relatório visual em `frontend/bundle-report.html`.

## As duas travas que este nó instala

**Erro de tipo derruba o build.** O script é `tsc --noEmit && vite build`, então
o empacotamento nem começa se a checagem falhar. Provado introduzindo
`const total: number = "isto nao e um numero"`: exit 2 no `tsc`, `vite build`
não executou.

**`fetch` fora da fronteira de dados derruba o lint.** `no-restricted-globals`
bloqueia `fetch` e `XMLHttpRequest` em todo o projeto, com a regra desligada
apenas em `src/data/**`. Provado com dois arquivos de conteúdo idêntico: o de
`src/` reprovou (exit 1), o de `src/data/` passou (exit 0) — a regra distingue
o local da chamada, não o texto dela. Isto é o antipadrão nº 1 da §19 da base
de conhecimento virando falha de build em vez de opinião de revisão.

## Arquivos criados

```
frontend/package.json          frontend/src/main.tsx
frontend/tsconfig.json         frontend/src/App.tsx
frontend/vite.config.ts        frontend/src/App.test.tsx
frontend/eslint.config.js      frontend/src/test/setup.ts
frontend/index.html            frontend/src/styles/index.css
frontend/.gitignore
```

## Correções feitas durante a execução

**O relatório de bundle vazava para a raiz do repositório.** O `filename` do
`rollup-plugin-visualizer` resolve contra o `cwd`, e o `dge evidence run`
executa da raiz — então o build produzia `bundle-report.html` fora de
`frontend/`. Corrigido resolvendo o caminho contra `import.meta.dirname`. A
evidência do build (EVD-009) foi refeita após a correção; a anterior foi
removida em vez de mantida como registro enganoso.

## Limitações conhecidas

- **Sem roteador.** `react-router` e o `basename` chegam em NODE-020/021. Este
  nó prova o caminho-base apenas na camada do bundler (URLs de asset), que é o
  que se pode provar sem rotas. O acesso direto a rota filha e o refresh em
  rota filha são contrato de NODE-024, não deste nó.
- **`src/data/` ainda não existe.** A regra de lint que a protege já está
  ativa e foi provada com um arquivo temporário. A fronteira real é NODE-019.
- **Sem orçamento de bundle bloqueante.** O relatório é gerado e o limite de
  aviso de chunk está em 500 kB, mas nada falha o build por tamanho ainda. A
  base de conhecimento (§15.1) recomenda tornar o orçamento bloqueante só
  depois que a linha de base estiver estável — o que ainda não é o caso.
- **Não há CI.** Como o resto do repositório, estes comandos rodam
  manualmente antes do commit.
- O teste do caminho-base em `App.test.tsx` afirma `/` porque é o valor sob
  `vitest`; o comportamento sob sub-caminho é verificado no build de produção
  (EVD-008), não no teste de componente.

## Pendência para o próximo nó

NODE-019 define a fronteira de dados em `src/data/`. É o ponto de maior
alavancagem do grafo: 21 nós assumem sua forma, e refazê-la depois de sete
telas construídas em cima é exatamente o retrabalho que o faseamento existe
para evitar.
