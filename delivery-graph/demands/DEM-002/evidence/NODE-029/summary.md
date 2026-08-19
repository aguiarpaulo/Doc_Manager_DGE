# NODE-029 — Ato de assinar

**Demanda:** DEM-002 · **Track:** TRK-signature-api · **Requisito:** REQ-022
**Depende de:** NODE-027 (`done`) · **Contrato: 6/6**

## O que entrou

| Arquivo | Papel |
|---|---|
| `app/models/signature_applied.py` | `AppliedSignature` — a assinatura que aconteceu |
| `app/services/signing.py` | Confirmação por senha + snapshot da rubrica |
| `app/utils_time.py` | Um relógio só, em UTC |
| `app/api/documents.py` | `POST .../sign` e `GET /documents/{id}/signatures` |
| `alembic/versions/e5f6a7b8c9d0_*.py` | Migração |

**173 testes** (16 novos), `ruff` limpo.

## O snapshot: a peça que faz a LGPD conviver com a prova

A decisão do GAP-004 depende de duas coisas serem verdade ao mesmo tempo:

1. o titular da rubrica pode trocá-la ou retirá-la quando quiser;
2. uma assinatura feita meses atrás continua mostrando exatamente a marca que foi
   feita.

Se a assinatura apenas **apontasse** para a rubrica de perfil, exercer o direito
de exclusão reescreveria o passado — ou pior, deixaria PDFs carimbados apontando
para nada.

Por isso `sign()` **copia os bytes** no ato, para `assinaturas/{request_id}/rubrica.png`,
e a assinatura guarda a chave dessa cópia. Há três testes exatamente sobre isso:

- a chave da assinatura fica sob `assinaturas/`, é diferente da de perfil, e o
  conteúdo bate;
- **o titular apaga a própria rubrica** e a assinatura segue intacta, com a imagem
  ainda no armazenamento — enquanto `GET /me/signature` passa a dar 404;
- **o titular troca a rubrica** e a assinatura antiga continua mostrando a marca
  original, enquanto o perfil já mostra a nova.

## A senha é o que torna o ato não-repudiável

Uma sessão aberta numa máquina destravada consegue clicar num botão; não consegue
fornecer uma senha que a pessoa nunca digitou. A verificação vive no **serviço**,
não no router, para que nenhum endpoint futuro a contorne por descuido.

Senha errada devolve 403 e **deixa a solicitação pendente** — um erro de digitação
não pode consumir o pedido. Senha vazia é recusada pelo schema.

## Quem pode assinar: ninguém além do indicado

Nem o solicitante, nem um administrador. Há teste para os dois casos: uma
assinatura é pessoal, e nenhum papel produz a de outra pessoa. Assinar duas vezes
dá 409, garantido também por índice único em `signature_request_id`.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Senha correta grava signatário, hora e versão | EVD-001 |
| 2 | Snapshot sobrevive a troca e exclusão da rubrica | EVD-002 |
| 3 | Senha incorreta mantém pendente | EVD-003 |
| 4 | Só o signatário indicado assina | EVD-004 |
| 5 | Assinar duas vezes é rejeitado | EVD-005 |
| 6 | Não altera aprovação nem cria versão | EVD-006 |

## O que assinar deliberadamente **não** faz

Nada em `sign()` toca `document.status`. Assinar e aprovar respondem perguntas
diferentes, e uma assinatura não pode mover o documento pela máquina de estados de
aprovação sem que ninguém tenha decidido isso. Há teste afirmando que o status
continua `enviado` e que nenhuma versão nova aparece — deixei um comentário no
próprio serviço marcando essa ausência como intencional, porque ausência não se lê
no código.

## Outras decisões

**`signatario_nome` é desnormalizado** na assinatura: a linha do tempo precisa
continuar mostrando quem assinou mesmo que o usuário seja renomeado depois.

**A senha nunca é persistida nem registrada.** Há teste varrendo todas as colunas
da assinatura em busca do valor enviado.

**`now_utc()` centraliza o relógio.** A hora de uma assinatura faz parte do que ela
prova, então não pode vir de um `datetime.now()` ingênuo espalhado pelo código.

## Limitações conhecidas

- **Sem carimbo no PDF ainda** — é NODE-033. Hoje a assinatura existe como
  registro e imagem guardada; ninguém as desenha sobre a página.
- **Sem recusa nem cancelamento** (NODE-030) e **sem cancelamento por nova
  versão** (NODE-031): uma solicitação pendente de uma versão antiga ainda pode ser
  assinada. **É a lacuna mais relevante em aberto** e o NODE-031 existe para ela.
- **Sem tela** (NODE-036).
- **Sem MFA no ato de assinar.** A senha basta pela decisão do intake; exigir TOTP
  de quem tem MFA ativo seria um endurecimento razoável, não pedido.
