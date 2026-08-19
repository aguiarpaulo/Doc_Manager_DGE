# NODE-031 — Nova versão cancela pendências

**Demanda:** DEM-002 · **Track:** TRK-signature-api · **Requisito:** REQ-024
**Depende de:** NODE-029 (`done`) · **Contrato: 5/5**

## Fecha a lacuna que o NODE-029 deixou aberta

Até aqui, uma solicitação pendente de uma versão antiga **ainda podia ser
assinada**. Eu registrei isso no summary do NODE-029 como a lacuna mais relevante
em aberto; este nó a fecha.

O problema é concreto: as coordenadas foram desenhadas contra uma paginação
específica. Um envio novo pode repaginar o arquivo, então honrar a marcação
anterior poria a rubrica **num lugar que ninguém apontou, numa página que o
signatário nunca viu**.

`cancel_pending_for_new_version` roda dentro do envio de versão, marca todas as
pendências como canceladas com o motivo (`"Nova versão (v2) enviada; a marcação
anterior deixou de valer."`), registra na auditoria e notifica cada signatário
afetado.

## O que sobrevive intocado

Assinaturas **já aplicadas** são outra coisa e não podem ser tocadas: elas
atestam a versão em que foram feitas, e essa versão continua existindo. Há teste
com um documento onde um signatário já assinou e outro ainda não — depois da nova
versão, a assinatura segue vinculada à sua versão e consultável pela API,
enquanto só a pendente foi cancelada.

**195 testes** (8 novos), `ruff` limpo.

## Contrato — 5/5

| # | Item | Evidência |
|---|---|---|
| 1 | Duas pendências viram duas canceladas | EVD-001 |
| 2 | Registra o motivo e notifica cada signatário | EVD-002 |
| 3 | Assinaturas concluídas sobrevivem vinculadas à sua versão | EVD-003 |
| 4 | Solicitação antiga não é mais assinável | EVD-004 |
| 5 | `reset_for_new_version` continua valendo | EVD-005 |

## Um teste de regressão que me corrigiu

O item 5 pede que o comportamento existente de re-upload não mude. Escrevi o
teste fazendo a autora do documento chamar `/review` — e ele falhou: **só
Administrador e Diretor movem o fluxo de aprovação**. O teste estava errado, não o
código. Corrigido para a diretora fazer as duas transições, e ele agora confirma
que `reset_for_new_version` continua zerando o status para `enviado`, incrementando
a versão e limpando `approved_version`.

## Decisões

**A notificação vai depois do commit**, como no NODE-028: falha de e-mail não
pode desfazer o upload.

**Cancelamento automático cancela pendências de qualquer versão**, não só da
imediatamente anterior. Uma pendência esquecida de duas versões atrás está ainda
mais desatualizada.

**Depois do cancelamento, pedir de novo é permitido e necessário** — a área
precisa ser marcada de novo sobre a paginação nova, que é justamente o ponto. Há
teste.

## Limitações conhecidas

- **A nova solicitação não é criada automaticamente.** Quem enviou a versão
  precisa remarcar a área e pedir de novo. Automatizar exigiria adivinhar onde a
  área correspondente ficou na paginação nova — exatamente o que este nó existe
  para impedir.
- **O e-mail de cancelamento não diz quem enviou a nova versão.** Diz o motivo e o
  documento; o autor aparece na linha do tempo (NODE-032).
- **Sem tela** para nada disso ainda.
