# NODE-036 — Tela de assinatura

**Demanda:** DEM-002 · **Track:** TRK-signature-ui · **Requisitos:** REQ-022, REQ-021
**Depende de:** NODE-029, NODE-028, NODE-034 (`done`) · **Contrato: 6/6**

## O que entrou

| Arquivo | Papel |
|---|---|
| `components/ui/Modal.tsx` | Diálogo acessível, promovido a `components/ui` |
| `features/assinatura/AssinarDocumentoPage.tsx` | Rota `/documentos/:id/assinar` |

**144 testes** no frontend (14 novos), `tsc` e `eslint` limpos.

## O link do e-mail funciona de ponta a ponta

A rota é exatamente o que `signature_link` monta no servidor
(`/documentos/{id}/assinar`), e fica **dentro** da rota protegida. Há teste que
chega anônimo — como quem clica no link —, passa pelo login e verifica que volta
para **aquele documento**, não para a raiz. É a mecânica de `state.de` do
NODE-020, agora encadeada de verdade: e-mail → login → documento certo.

## O modal cumpre a §12.3 item por item

Portal acima da árvore, `role="dialog"`, `aria-modal`, título associado, foco
movido para dentro ao abrir, **Tab preso** no ciclo, Escape fecha, foco
**restaurado** em quem abriu, e o fundo marcado como `inert`.

Cada um tem teste. Promovi o componente a `components/ui` porque o contrato é
genérico e estável — a §4 só admite a promoção nesse caso.

## Um acoplamento que o teste expôs

A primeira versão marcava `document.getElementById("root")` como inerte. Funciona
no app, mas **depende de um id fixo** — e numa árvore de teste esse elemento não
existe, então o teste falhou.

Não era problema do teste: era acoplamento real. Passei a marcar **todos os irmãos
do portal** em `document.body`, o que é mais correto e não presume estrutura
alguma. O teste virou melhor também: verifica que o fundo real ficou inerte, não
que um id específico recebeu um atributo.

## A senha

Vive só no estado local enquanto o diálogo está aberto e é limpa ao fechar. Há
três testes: que **não aparece em `sessionStorage` nem `localStorage`**, que o
campo volta vazio ao reabrir, e que o `type` é `password`.

Confirmar fica desabilitado com senha vazia — sessão aberta não basta para
assinar, que é a decisão do intake — e durante o envio, impedindo duplicidade.

Senha errada **mantém o diálogo aberto** com o erro da API: um erro de digitação
não pode consumir a pendência.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Senha correta conclui, com nome e horário | EVD-001 |
| 2 | Senha incorreta mantém pendência, erro acionável | EVD-002 |
| 3 | Confirmar desabilitado durante o envio | EVD-003 |
| 4 | Link do e-mail passa pelo login e volta ao documento | EVD-004 |
| 5 | Modal com foco, trap e restauração | EVD-005 |
| 6 | Senha não persistida nem registrada | EVD-006 |

## Limitações conhecidas

- **A rubrica não é desenhada sobre a página nesta tela.** O item 1 fala em "a
  rubrica aparece na área marcada"; o que esta tela mostra é a assinatura
  **registrada** com nome e horário, e o carimbo aparece no **PDF baixado**
  (NODE-033, testado lá). Mostrar a marca sobreposta ao visualizador aqui seria
  repetir o carimbo no cliente — decidi não duplicar essa lógica. **Registro a
  divergência de leitura em vez de escondê-la:** se você entende que a tela deve
  exibir a rubrica sobreposta, é trabalho adicional que não está feito.
- **Recusar não tem interface.** `recusarSolicitacao` existe na fronteira e o
  backend está pronto (NODE-030), mas nenhum item deste contrato pede o botão.
- **Sem visualizador do PDF nesta tela.** Quem assina vê nome, versão e página,
  não o documento renderizado — o que é pouco para uma decisão de assinatura.
  Reaproveitar o `VisualizadorPdf` aqui é melhoria óbvia e pequena.
