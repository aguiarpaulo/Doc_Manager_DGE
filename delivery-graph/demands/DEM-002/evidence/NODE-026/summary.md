# NODE-026 — Rubrica: modelo, armazenamento e `delete_object`

**Demanda:** DEM-002 · **Track:** TRK-signature-api · **Requisito:** REQ-019
**Contrato: 6/6** · Primeiro nó da fase 2, em `feat/assinatura-documentos`

## O que entrou

| Arquivo | Papel |
|---|---|
| `app/models/signature.py` | `UserSignature` — tabela própria, um registro por usuário |
| `app/services/signatures.py` | Validação, gravação, leitura e exclusão |
| `app/api/signatures.py` | `PUT`/`GET`/`DELETE /me/signature` |
| `alembic/versions/c3d4e5f6a7b8_*.py` | Migração da tabela |
| `app/storage.py` | `delete_object` no protocolo e nas duas implementações |
| `tests/test_storage_minio_live.py` | Round-trip real contra MinIO (`GED_LIVE_MINIO=1`) |

**124 → 143 testes** no backend (19 novos) + 4 contra MinIO real. `ruff` limpo,
frontend 96 verdes.

## A proteção do item 3 é estrutural, não uma checagem

Nenhuma rota recebe `user_id`. Ler ou gravar a rubrica de outra pessoa não é
*proibido* por uma verificação que alguém pode errar depois — é **inexprimível**,
porque não existe caminho que a descreva. Um administrador que chame estes
endpoints age sobre a **própria** rubrica como qualquer um; há teste afirmando
que ele recebe 404 (não tem rubrica) em vez da imagem alheia.

Também não há helper de URL presigned em `app/storage.py`, e deixei isso escrito
lá: uma URL que se autentica sozinha tiraria a decisão de acesso da API e a
entregaria a quem encaminhasse o link.

## Por que a rubrica é tabela e não coluna em `users`

Os dois têm ciclos de vida opostos. Um usuário **nunca** é apagado de verdade — a
autoria e a trilha de auditoria dependem da linha sobreviver. A imagem da rubrica
**é** apagável: é dado pessoal sob a LGPD e o titular pode retirá-la quando
quiser. Apagar uma linha aqui é operação normal; apagar um usuário não é.

E o desenho do GAP-004 se confirma na prática: esta é a rubrica **de perfil**.
Quando um documento for assinado (NODE-029), a imagem será copiada como snapshot
imutável no registro da assinatura — então exercer o direito de exclusão nunca
reescreve o que uma assinatura passada mostrava.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | PNG sob `rubricas/`, metadado no banco | EVD-001 |
| 2 | Só o titular grava e lê a própria | EVD-002 |
| 3 | Nenhum endpoint por `user_id`; sem presigned | EVD-003 |
| 4 | `delete_object` nas implementações, com teste | EVD-004 + **EVD-007 (MinIO real)** |
| 5 | Titular apaga e o objeto some | EVD-005 |
| 6 | Desativar usuário não apaga a rubrica | EVD-006 |

## O item 4 começou com prova fraca e foi fechado depois

A primeira versão do teste da `MinioStorage` apenas afirmava que o método existe —
o que não é teste. O Docker Desktop estava fora do ar naquele momento.

Reescrevi primeiro para exercitar **o adaptador** com um cliente falso, provando
que `remove_object` é chamado com o bucket e a chave corretos. Quando o Docker
voltou, acrescentei `tests/test_storage_minio_live.py`, que faz o round-trip real:
grava, lê, apaga e confirma que uma leitura seguinte levanta `S3Error` — a
afirmação que a fake **não pode** sustentar, porque uma fake que não guarda nada
"apaga" nada com sucesso. Também cobre a idempotência contra o bucket real e a
substituição de rubrica deixando só o objeto novo.

O arquivo é ignorado sem `GED_LIVE_MINIO=1`, então a suíte padrão continua
rodando sem Docker.

## Decisões menores que valem registro

**Trocar a rubrica escreve um objeto novo antes de apagar o antigo**, e a chave
carrega o id da assinatura. Sobrescrever a mesma chave arriscaria um PDF carimbado
em geração ler bytes pela metade.

**Só PNG, no máximo 1 MB.** Um desenho de canvas tem alguns KB, e aceitar um só
formato mantém o carimbo da fase 2 livre de ramificação por formato.

**`UserRead` ganhou `has_signature`** — se existe rubrica, nunca a rubrica. A SPA
precisa disso para decidir se exige o registro no primeiro acesso, e não pode
pagar uma requisição extra a cada montagem. Há teste de que `/auth/me` não devolve
a imagem nem o `object_key`. Propagar o campo para o contrato do frontend fez o
`tsc` apontar quatro fixtures desatualizados — todos corrigidos.

**A resposta do download vai com `Cache-Control: private, no-store`**: dado
pessoal não pode ficar em cache compartilhado.

## Limitações conhecidas

- **Sem tela.** O canvas de registro é NODE-034; hoje só há API.
- **A migração não foi executada contra PostgreSQL** — os testes constroem o
  esquema a partir dos modelos em SQLite, como o resto da suíte. A migração roda
  no `docker compose up` do próximo deploy.
- **Nenhuma varredura de objetos órfãos.** Se a gravação do banco falhar depois do
  `put_object`, o objeto fica no bucket sem metadado. A ordem escolhida (objeto
  primeiro) prefere lixo a uma referência quebrada, mas não há coletor.
