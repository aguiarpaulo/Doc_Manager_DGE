# NODE-019 — Fronteira de dados tipada

**Demanda:** DEM-002 · **Track:** TRK-spa-foundation · **Requisito:** REQ-027
**Depende de:** NODE-018 (`done`)

## O que foi feito

Criada `frontend/src/data/`, a única camada do projeto autorizada a falar HTTP.

| Arquivo | Responsabilidade |
|---|---|
| `http.ts` | Transporte único: URL-base, token, cabeçalhos, 204, erros, `AbortSignal` |
| `errors.ts` | `ApplicationError` + taxonomia de categorias + achatamento do `detail` |
| `contracts.ts` | Tipos da API **e** parsers de runtime |
| `remoteState.ts` | União discriminada de estado remoto |
| `useApiData.ts` | Hook reativo com geração, cancelamento e revalidação |
| `api.ts` | Funções de domínio tipadas acima do transporte |

## Contrato de validação — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Transporte único com URL-base, token, cabeçalhos, erros, AbortSignal | EVD-001 |
| 2 | 204 e resposta não-JSON sem presumir corpo | EVD-002 |
| 3 | Validação em runtime, não só tipagem | EVD-003 |
| 4 | RemoteState distingue loading/revalidating/empty/error/success | EVD-004 |
| 5 | Erros diferenciados por categoria | EVD-005 |
| 6 | Lint barra `fetch` fora da fronteira | EVD-006 |

**42 testes passando** (4 arquivos), `tsc --noEmit` e `eslint .` limpos.

## Decisões que valem registro

**Parsers escritos à mão, sem biblioteca de validação.** O contrato tem seis
formas (`Usuario`, `Obra`, `Documento`, `Etapa`, `Tokens`, listas). Uma
biblioteca como zod resolveria o mesmo com menos código, mas custa bundle e a
regra do projeto é perguntar antes de instalar. Se a superfície crescer — e a
fase 2 vai crescê-la — trocar é um refactor local a `contracts.ts`, porque
nenhum consumidor conhece a forma do parser. **Fica registrado como ponto de
decisão para a fase 2.**

**A UI nunca vê status HTTP.** `ApplicationError.category` é o que a tela
consulta (`autenticacao`, `autorizacao`, `validacao`, `conflito`,
`nao-encontrado`, `indisponivel`, `rede`, `cancelado`). Conhecimento de
protocolo não vaza da fronteira.

**Cancelamento não é erro.** Categoria própria, e o hook o descarta em silêncio
— navegar para outra tela não pode pintar "falha ao carregar".

**As duas formas de `detail` do FastAPI foram reproduzidas do cliente atual.**
`streamlit_app/api_client.py:15-40` já achatava string e lista por campo; a
lógica foi portada, e o 422 agora também expõe `fieldErrors` separadamente,
para o formulário destacar o campo em vez de só mostrar um texto corrido.

**`idle` foi removido do `RemoteState`.** O hook sempre busca na montagem, então
o estado era inalcançável. Estado morto num tipo discriminado obriga todo
consumidor a tratar um caso que nunca ocorre.

## Correções durante a execução

**O `eslint-plugin-react-hooks` v7 reprovou o desenho original do hook**, em dois
pontos legítimos: mutação de ref durante o render, e `setState` síncrono dentro
de efeito (que causa render em cascata). Redesenhei em vez de silenciar:

- o ref da função de busca passou a ser atualizado **dentro de um efeito**;
- o estado inicial passou a ser `loading` em vez de `idle`, eliminando a
  transição síncrona na montagem;
- a transição para `revalidating` acontece no manipulador de evento, onde é
  legítima, e um contador de gatilho dispara o efeito.

**Um teste meu deu falso negativo.** `new Response("dados")` recebe
`content-type: text/plain` automático do polyfill, então o ramo de fallback para
`application/octet-stream` nunca era exercitado. Corrigido usando resposta sem
corpo — o único jeito de realmente não haver cabeçalho.

## Limitações conhecidas

- **`VITE_API_BASE_URL` tem default `/api`, que ainda não existe no Caddy.** A
  API monta os routers em `/auth`, `/obras`, `/documents` etc., sem prefixo. Quem
  concilia isso é NODE-024 (deploy na mesma origem); até lá, dev usa proxy do
  Vite. **Se NODE-024 decidir outro prefixo, muda só esta constante.**
- **`configurarTokenProvider` ainda não tem implementação real.** O transporte já
  anexa `Authorization` quando há token; quem fornece a sessão é NODE-020.
- **Sem cache nem stale-while-revalidate.** `useApiData` busca a cada montagem.
  A §9 da base de conhecimento descreve o padrão de cache, mas nenhum requisito
  o exige ainda — entra quando houver tela que sofra com isso, não antes.
- **Mudança de dependência mantém os dados anteriores visíveis** até a nova
  resposta chegar, sem marcar `revalidating`. É consequência de não fazer
  transição síncrona no efeito. Aceitável hoje; se incomodar numa tela real,
  resolve-se com `key` no componente.
- `api.ts` cobre os endpoints que a fase 1 precisa. Os de assinatura entram na
  fase 2, nos nós da `TRK-signature-api`.
