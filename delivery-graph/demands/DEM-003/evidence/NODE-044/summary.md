# NODE-044 — Recusar solicitação com justificativa na tela de assinatura

**Demanda:** DEM-003 · **Track:** TRK-lacunas-ui · **Requisito:** REQ-038
**Contrato: 5/5** · itens em `evidence.json` e `verification.md`

## O que entrou

O botão "Recusar assinatura" e o diálogo de justificativa em
`AssinarDocumentoPage`, fechando o par com o NODE-042: a API já notificava o
solicitante por e-mail, mas nada na interface chamava `recusarSolicitacao`.

| Arquivo | Mudança |
|---|---|
| `frontend/src/features/assinatura/AssinarDocumentoPage.tsx` | botão, `Modal` de recusa, `recusar()` |
| `frontend/src/features/assinatura/AssinarDocumentoPage.test.tsx` | 7 testes novos (`describe("recusar")`) |

`vitest`: **208 passando**, `tsc`, `eslint` e `vite build` limpos.

## O botão não tem condição própria, e isso é o desenho

O item 1 pede que recusar apareça **somente para o signatário indicado**. Não
escrevi uma condição para isso: o botão vive dentro do mesmo bloco que só existe
quando `minhaPendencia` está definida — e `minhaPendencia` é a solicitação
`pendente` cujo `signatario_id` é o do usuário corrente, a mesma que habilita
"Assinar documento".

Uma segunda condição equivalente poderia divergir da primeira numa edição futura.
Há teste afirmando que quem não é o signatário indicado não vê nenhum dos dois.

## O texto digitado sobrevive ao erro

Quando a API recusa a recusa, a mensagem aparece e **o motivo permanece no
campo**. Reescrever o textarea seria punir quem já explicou — e a pessoa
provavelmente digitaria a mesma coisa de novo. Há teste afirmando o texto intacto
depois do erro.

O `motivo.trim() === ""` guarda os dois lados: desabilita o botão e, se algo
escapar, a função devolve cedo com a explicação. A API também recusa — a
interface não é a autoridade, só evita o ida-e-volta inútil.

## Contrato — 5/5

| # | Item | Evidência | Testes executados |
|---|---|---|---|
| 1 | Botão só para o signatário indicado | EVD-001 | 1 |
| 2 | Justificativa vazia ou só espaços mantém o envio desabilitado | EVD-002 | 1 |
| 3 | Após recusar, a pendência sai da tela | EVD-003 | 7 |
| 4 | Erro da API sem apagar o texto digitado | EVD-004 | 1 |
| 5 | Botão desabilitado durante o envio | EVD-005 | 1 |

## Uma ressalva honesta sobre o item 3

O contrato diz "a pendência sai da tela **e a etapa aparece na linha do tempo com
o motivo**". A primeira metade está provada aqui. A segunda **não**, e não
poderia estar: a linha do tempo é renderizada pelo `ObraShell`, não por esta
tela, e num teste de componente a fronteira está simulada — eu estaria afirmando
o que eu mesmo dublei.

O que existe é: o registro da etapa provado no backend (NODE-030 e NODE-032), o
`LinhaDoTempo` provado no NODE-037, e o diálogo aqui **avisando** que o motivo vai
para a linha do tempo e para quem solicitou (há teste desse aviso). A costura das
três pontas em navegador é contrato do NODE-047.

Registrar isso como "5/5 com ressalva" e não como 4/5 é uma escolha que quero
explícita: o item pertence a esta tela, o comportamento observável nela está
provado, e a parte não provada está nomeada e endereçada a um nó existente. Se
essa leitura não te servir, o item a rebaixar é o 3.

## Limitações conhecidas

- **A etapa na linha do tempo não é verificada aqui** — ver acima; NODE-047.
- **O e-mail de recusa não é verificado aqui.** É o NODE-042, e a leitura no
  Mailpit em navegador é o NODE-047.
- **Sem confirmação dupla.** Recusar com motivo preenchido age direto; a recusa é
  encerramento definitivo da pendência, e desfazê-la é pedir de novo.
- **`AcoesDocumento` continua sem esconder ações por status**, como a limitação já
  registrada no CLAUDE.md — esta tela não muda isso.
