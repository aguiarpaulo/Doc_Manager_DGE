# NODE-030 — Recusa com justificativa e cancelamento

**Demanda:** DEM-002 · **Track:** TRK-signature-api · **Requisito:** REQ-029 (`should`)
**Depende de:** NODE-029 (`done`) · **Contrato: 5/5**

## O que entrou

`decline` e `cancel` em `app/services/signing.py`, dois endpoints em
`app/api/documents.py`, schemas `DeclineRequest`/`CancelRequest` e duas ações de
auditoria. **187 testes** (14 novos), `ruff` limpo.

## A assimetria entre recusar e cancelar é o desenho

| | Recusar | Cancelar |
|---|---|---|
| Quem | Só o signatário indicado | Quem solicitou, ou administrador |
| Motivo | **Obrigatório** | Opcional |
| Signatário pode? | Sim, é dele | **Não** |

**Recusar** é uma declaração sobre o documento, então ninguém coloca palavras na
boca do signatário — o solicitante tentando recusar leva 403. E a justificativa é
exigida porque uma recusa sem motivo deixa o solicitante sem nada em que agir.

**Cancelar** pertence a quem pediu. Deliberadamente **não** ao signatário:
cancelar a própria assinatura pendente seria um jeito silencioso de se esquivar
dela, enquanto recusar deixa um motivo no registro. A mensagem do 403 diz isso ao
usuário — *"Se você é o signatário, recuse informando o motivo"* — em vez de só
negar.

## Contrato — 5/5

| # | Item | Evidência |
|---|---|---|
| 1 | Recusa exige justificativa não vazia | EVD-001 |
| 2 | Recusa encerra e registra autor, hora e motivo | EVD-002 |
| 3 | Cancelar: só solicitante ou administrador | EVD-003 |
| 4 | Signatário recebe 403 ao cancelar | EVD-004 |
| 5 | Recusada ou cancelada não é mais assinável | EVD-005 |

## Detalhes

**Justificativa só com espaços é recusada**, e a que passa é gravada sem espaços
nas pontas.

**Estados terminais são realmente terminais**: `_ensure_still_open` é o único
portão, então assinada/recusada/cancelada não voltam atrás por nenhum dos três
caminhos. Há teste de que um pedido assinado não pode ser recusado nem cancelado
depois.

**Recusar libera um novo pedido para a mesma pessoa.** A trava de duplicidade do
NODE-027 só bloqueia pendências, então o solicitante pode corrigir o documento e
pedir de novo — que é o fluxo real depois de uma recusa. Há teste.

**Quem está fora da obra recebe 404, não 403**, porque a existência do documento
continua escondida fora do escopo.

## Limitações conhecidas

- **Nenhum e-mail é enviado na recusa ou no cancelamento.** O solicitante só
  descobre olhando o documento. Notificar seria simétrico ao NODE-028, mas nenhum
  item de contrato pede — fica registrado como melhoria óbvia.
- **A pendência de uma versão antiga ainda é assinável** — lacuna herdada do
  NODE-029 e endereçada pelo NODE-031, o próximo.
- **Sem tela** (NODE-036 traz recusa; cancelamento ainda não tem nó de UI
  dedicado).
