# NODE-043 — Tela de perfil: ver, trocar e apagar a própria rubrica

**Demanda:** DEM-003 · **Track:** TRK-lacunas-ui · **Requisito:** REQ-033
**Contrato: 6/6** · itens em `evidence.json` e `verification.md`

## O que entrou

A rota `/perfil/rubrica`, que fecha a lacuna aberta lá no NODE-026: o direito de
exclusão decidido no GAP-004 existia na API desde então, mas **não tinha
interface** — só era exercível por chamada direta. A tela de registro já
prometia, por escrito, que a pessoa poderia retirar a rubrica "no seu perfil".
Agora esse perfil existe.

| Arquivo | Mudança |
|---|---|
| `frontend/src/features/rubrica/PerfilRubricaPage.tsx` | novo |
| `frontend/src/features/rubrica/PerfilRubricaPage.test.tsx` | novo — 13 testes |
| `frontend/src/features/auth/RotaProtegida.tsx` | `ROTAS_SEM_RUBRICA` |
| `frontend/src/App.tsx` | rota `/perfil/rubrica` |
| `frontend/src/features/obras/ObraShell.tsx` | link "Minha rubrica" no cabeçalho |
| `frontend/src/components/ui/modal.css` | novo — estilos do Modal |
| `frontend/src/features/assinatura/assinatura.css` | regras do Modal removidas |
| `frontend/src/features/rubrica/rubrica.css` | `.rubrica__imagem` |
| `frontend/src/features/obras/ObraShell.test.tsx` | duplo de `historicoDocumento` |

`vitest`: **208 passando** (13 novos), `tsc`, `eslint` e `vite build` limpos.

## Uma frase do contrato decidiu o desenho da rota

O item 4 diz que, depois de apagar, o guarda volta a exigir o registro **"na
próxima rota protegida"**. Não "imediatamente". Isso não é detalhe de redação: se
`/perfil/rubrica` ficasse dentro do guarda de rubrica, apagar dispararia o
redirecionamento no mesmo instante e a pessoa seria expulsa da tela onde acabou
de agir, antes de ver que a ação deu certo.

Então a rota entrou na mesma condição de exceção que `/rubrica` já tinha. O que
era um `pathname !== "/rubrica"` virou um conjunto nomeado, `ROTAS_SEM_RUBRICA`,
porque a exceção deixou de ser um caso e passou a ser uma categoria.

Há teste para as duas metades: depois de apagar, a tela **fica** e passa a
convidar ao registro; e o clique seguinte, para o acervo, cai na tela de
registro.

## Por que a senha, de novo

A justificativa é a mesma que o NODE-041 escreveu para a API, e vale repetir
porque ela **não é** a de assinar: assinar exige senha para o ato ser
não-repudiável; apagar exige senha porque **não dá para desfazer**. A imagem
some. Uma sessão aberta numa máquina destravada clica num botão; não digita uma
senha que a pessoa nunca forneceu.

O diálogo diz as duas coisas que a pessoa precisa saber antes de confirmar: que
não há como recuperar, e que **as assinaturas já feitas continuam válidas** —
porque cada uma guarda a própria cópia do traço. É a promessa do snapshot,
escrita onde ela é relevante.

## Contrato — 6/6

| # | Item | Evidência | Testes executados |
|---|---|---|---|
| 1 | Mostra a rubrica quando existe; convida ao registro quando não | EVD-001 | 4 |
| 2 | Trocar abre o mesmo canvas e substitui a anterior | EVD-002 | 3 |
| 3 | Apagar exige senha no Modal do NODE-036 e informa a validade das assinaturas | EVD-003 | 5 |
| 4 | Depois de apagar, o guarda volta a exigir registro na próxima rota | EVD-004 | 1 |
| 5 | Nenhuma chamada envia id de usuário | EVD-005 | 1 |
| 6 | Carga, vazio e erro distintos e acionáveis | EVD-006 | 4 |

Cada item é uma execução de `vitest` filtrada e **gravada** em
`artifacts/EVD-00N-command.json` — não a alegação de que o teste existe. Conferi
a contagem de cada uma: um filtro que não casasse nada passaria com zero testes,
e isso é indistinguível de sucesso se ninguém olhar.

O item 5 é verificado afirmando que `baixarRubrica` é chamada **sem argumento
algum** e `apagarRubrica` só com a senha — o recurso é sempre `/me/signature`,
nunca `/users/{id}/signature`. Um `id` de usuário não tem por onde entrar.

O item 2 vai além de "chamou a API": o teste afirma que a tela **relê** a rubrica
depois de salvar, então o que aparece é a nova imagem e não a antiga em cache.

## Duas coisas que a suíte inteira pegou, e nenhuma era minha tela

**O Modal era compartilhado, mas o CSS dele não.** O componente foi promovido a
`components/ui` num nó anterior; as regras ficaram em
`features/assinatura/assinatura.css`. Enquanto só a tela de assinatura o usava,
ninguém notou. A segunda tela a usá-lo dependeria de um import que ela não faz —
funcionaria apenas porque o Vite junta todo o CSS num bundle. Movi as regras para
`components/ui/modal.css`, importado pelo próprio `Modal.tsx`.

**`ObraShell.test.tsx` nunca dublou `historicoDocumento`.** O auto-mock devolvia
`undefined`, que o `useApiData` classifica como sucesso (não é array vazio), e o
`LinhaDoTempo` estourava no `.map` — **de forma assíncrona, depois do teste que a
disparou**. Por isso a falha aparecia de forma intermitente e era atribuída a um
arquivo que não a causava. Vi acontecer numa execução e não na seguinte; era
tentador tratar como ruído. O duplo entrou no `beforeEach`.

Isso não é defeito de produção: `request()` valida a resposta pelos parsers de
`contracts.ts`, e um não-array não passaria. É defeito do teste, e é exatamente o
tipo de coisa que só a suíte completa mostra — a mesma lição do NODE-025 e do
NODE-041, agora pela terceira vez.

## Limitações conhecidas

- **Não verificado em navegador.** Apagar com senha e o guarda voltando a exigir
  registro são contrato do NODE-047; aqui a fronteira de dados está simulada.
- **Sem confirmação dupla ao trocar.** Trocar sobrescreve direto, sem diálogo: o
  ato é reversível redesenhando, ao contrário de apagar.
- **A imagem é lida por `URL.createObjectURL`** e revogada ao desmontar, mas o
  jsdom não exercita o ciclo de vida real do blob — só prova que a URL é criada
  uma vez por blob.
- **O link "Minha rubrica" só existe no cabeçalho do shell da obra.** Quem está
  na tela de assinatura ou na de administração chega pela URL.
