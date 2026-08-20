# NODE-041 — Confirmação por senha ao apagar a rubrica (API)

**Demanda:** DEM-003 · **Track:** TRK-lacunas-api · **Requisito:** REQ-033
**Contrato: 6/6** · Primeiro nó da DEM-003

## O que mudou

`DELETE /me/signature` passou a exigir a senha do titular no corpo. `pytest`:
**237 passando**, `ruff` limpo. Frontend: 183 testes, `tsc`, `eslint` e build
limpos.

| Arquivo | Mudança |
|---|---|
| `app/api/signatures.py` | `RemoveSignatureRequest` + verificação da senha |
| `tests/conftest.py` | `make_png()` — PNG real reutilizável |
| `tests/test_signatures.py` | 7 testes novos + adaptação dos existentes |
| `tests/test_signing.py` | Chamada de exclusão atualizada |
| `frontend/src/data/api.ts` | `apagarRubrica(password)` |

## A decisão do GAP-007, e por que ela se sustenta

Assinar exige senha porque o ato precisa ser não-repudiável. Apagar é o titular
exercendo um direito sobre dado próprio, e o argumento **não se transfere
automaticamente** — foi por isso que registrei como gap em vez de decidir sozinho.

Você equiparou os dois, e a razão que sustenta isso é outra: **a exclusão não é
reversível**. A imagem some. Uma sessão aberta numa máquina destravada consegue
clicar num botão; não consegue fornecer uma senha que a pessoa nunca digitou.

## Uma ressalva de protocolo que deixei escrita no código

A senha viaja no corpo de um `DELETE`. A RFC 9110 diz que um cliente **não
deveria** gerar conteúdo em `DELETE`, e alguns intermediários o descartam. Aqui o
único proxy é o nosso próprio Caddy, que repassa corpo em qualquer método — e o
contrato do nó nomeia `DELETE`. Se isso mudar, mover para um `POST` é alteração
local, e o comentário no endpoint diz exatamente isso.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Exige senha; 403 quando errada | EVD-001 |
| 2 | Senha errada não apaga nada | EVD-002 |
| 3 | Rota segue sem id de usuário | EVD-003 |
| 4 | Assinaturas aplicadas e snapshots intactos | EVD-004 |
| 5 | Senha não é registrada nem gravada | EVD-005 |
| 6 | `pytest` e `ruff` integrais | EVD-006, EVD-007 |

Um teste que vale destacar: **a senha de outro usuário não apaga a minha
rubrica**, ainda que o chamador seja o dono. E o corpo tornou-se obrigatório —
apagar sem confirmar devolve 422, não passa silenciosamente.

## Três coisas que a suíte inteira pegou

**`test_signing.py` também apagava a rubrica sem senha.** Só a execução completa
mostrou — é literalmente o item 6 do contrato, herdado da regressão do Caddy no
NODE-025.

**O PNG dos testes era falso.** Bytes com a assinatura correta mas sem estrutura
válida passam pela validação da API (que só olha o content type) e **só falham lá
na frente**, quando o carimbo tenta desenhar a rubrica no PDF. Virou `make_png()`
no `conftest`, com o motivo escrito.

**Dois defeitos meus do NODE-040 vieram à tona:** o vitest coletava os specs do
Playwright (`test.describe.configure` fora de contexto) e a regra anti-`fetch`
reprovava o harness E2E, que fala com servidor real por desenho. Eu nunca rodei
`npm test` depois de criar `e2e/` naquele nó. Corrigidos com uma exclusão no
`vite.config.ts` e um escopo no `eslint.config.js`.

## Estado do nó

O `dge verify` avançou para `verified` — o mesmo comportamento do NODE-018.
**Não está `done`**; `dge done` continua sendo seu.

## Limitações conhecidas

- **A tela ainda não existe.** `apagarRubrica` já pede senha na fronteira, mas
  nenhuma interface a chama — é o NODE-043.
- **Sem limite de tentativas.** Senha errada pode ser repetida indefinidamente;
  o mesmo já vale para o login e para assinar, então não introduzi assimetria.
- **Não verificado contra o stack real.** A exclusão com senha em navegador é
  contrato do NODE-047.
