# NODE-020 — Autenticação na SPA

**Demanda:** DEM-002 · **Track:** TRK-spa-foundation · **Requisitos:** REQ-026, REQ-027
**Depende de:** NODE-019 (`done`) · **Contrato: 6/6**

> Nota de processo: o `dge evidence run/add` **regenera este arquivo**. Escreva o
> summary depois de registrar toda a evidência, ou ele é sobrescrito — foi o que
> aconteceu na primeira tentativa deste nó.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Login contra a **API real** + armazenamento do token | EVD-006 (integração ao vivo) |
| 2 | Rota protegida redireciona e retorna ao destino | EVD-001 |
| 3 | Papel vem de `GET /auth/me`, não do JWT | EVD-002 |
| 4 | Refresh renova sem deslogar | EVD-003 |
| 5 | Credencial inválida: erro acionável, sem revelar existência | EVD-004 |
| 6 | Testes de componente de sucesso e falha sem serviço real | EVD-005 |

**61 testes** (54 com fronteira simulada + 7 contra API real), `tsc` e `eslint`
limpos. Build: 237.83 kB / **76.26 kB gzip**.

## Como o item 1 foi fechado

A primeira versão deste nó parou em 5/6 e o `dge verify` recusou — corretamente.
Registrar teste mockado como prova de comportamento contra a API real é o erro do
NODE-015 documentado no CLAUDE.md.

Subi a API de verdade e criei `src/data/live.integration.test.ts`, que roda **a
própria fronteira de dados** contra ela. Nada mockado: transporte real, parsers
reais, respostas reais.

```
GED_DATABASE_URL=sqlite:///<scratch>/node020.db  uv run uvicorn app.main:app
GED_LIVE_API=1 VITE_API_BASE_URL=http://127.0.0.1:8000  vitest run live.integration
→ 7 passed
```

O esquema veio de `Base.metadata.create_all`, não do alembic, porque a migração
`b2c3d4e5f6a7` é específica de PostgreSQL — a suíte de testes já faz assim.
MinIO não é necessário: login não toca armazenamento.

**O teste é ignorado por padrão** (`describe.runIf`), então a suíte normal segue
rodando sem serviço nenhum. Ele só executa com `GED_LIVE_API=1`.

O que ele provou de fato:

- `POST /auth/login` devolve `access_token` + `refresh_token` distintos, e os
  parsers aceitam o formato real;
- `GET /auth/me` devolve `id`/`username`/`email`/`role`/`is_active`, e o `id` é
  UUID de verdade;
- o token renovado pelo refresh **realmente vale** para a chamada seguinte;
- senha errada vira categoria `autenticacao` com status 401;
- **usuário malformado também dá 401, não 422** — confirmando contra a API real a
  regra documentada no CLAUDE.md de que `LoginRequest.username` é `str` puro de
  propósito, para não ensinar a regra de nomes a um chamador anônimo.

Esse último caso é o tipo de coisa que teste mockado nunca pegaria.

## Decisão de armazenamento da sessão

- **Access token só em memória.** Nunca toca `localStorage` nem
  `sessionStorage`; há teste afirmando que a string não aparece em nenhum dos
  dois.
- **Refresh token em `sessionStorage`**, não `localStorage`: sobrevive ao F5 na
  mesma aba e morre com a aba (§10.1 da base de conhecimento).
- **Nenhum dado pessoal persistido** — papel e identidade sempre de `/auth/me`.

## Outras decisões

**`RotaProtegida` tem três estados.** Enquanto a sessão é reconstruída pelo
refresh, ela não decide nada e mostra região `aria-live`. Redirecionar nesse
instante expulsaria o usuário a cada F5 — há teste.

**O destino pretendido viaja em `state.de`.** É a mecânica de que o link do
e-mail de assinatura (REQ-021, fase 2) vai depender. Testado com `/obras/obra-99`.

**Sessão pela metade é desfeita:** login OK mas `/auth/me` falhando limpa tudo.

**Recuperação de senha é silenciosa quanto ao resultado**, para não desfazer no
cliente a indistinção que a API mantém de propósito.

## Bug corrigido durante a execução

`onSubmit={void aoEnviar}` avaliava para `undefined` em vez de registrar o
manipulador — o formulário recarregaria a página em vez de autenticar.

## Limitações conhecidas

- **Sem renovação automática em 401.** O refresh só roda na montagem; quando o
  access token expira em uso (15 min), a próxima chamada dá 401 e o usuário volta
  ao login. Nenhum item do contrato exige o interceptor.
- **`PaginaInicial` é placeholder** — NODE-021 a substitui pelo shell do SEI.
- **`VITE_API_BASE_URL` default `/api`** ainda não conciliado com o Caddy
  (pendência herdada de NODE-019, resolvida em NODE-024). A integração ao vivo
  usou URL absoluta.
- **Sem tela de redefinição de senha** (a que consome o token do e-mail);
  `api.resetPassword` já existe na fronteira.
- O teste ao vivo roda contra **SQLite**, não PostgreSQL. Basta para o contrato
  de autenticação; diferenças de dialeto entram no smoke de NODE-024.
