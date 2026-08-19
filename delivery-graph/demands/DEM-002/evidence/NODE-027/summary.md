# NODE-027 — Solicitação de assinatura: modelo e API

**Demanda:** DEM-002 · **Track:** TRK-signature-api · **Requisito:** REQ-020
**Depende de:** NODE-026 (`done`) · **Contrato: 6/6**

## O que entrou

| Arquivo | Papel |
|---|---|
| `app/models/signature_request.py` | `SignatureRequest` + `SignatureRequestStatus` |
| `app/schemas/signature_request.py` | Create/Read, com limites de 0..1 na área |
| `app/services/signature_requests.py` | Autorização, validação e criação |
| `app/api/documents.py` | `POST`/`GET /documents/{id}/signature-requests` |
| `alembic/versions/d4e5f6a7b8c9_*.py` | Migração |

**143 → 158 testes** (17 novos neste nó), `ruff` limpo.

## As duas decisões que evitam rubrica no lugar errado

**Coordenadas normalizadas com origem no canto superior esquerdo.** Guardadas
como frações da página (0..1) exatamente como a pessoa desenhou, porque um canvas
mede a partir do topo. O PDF mede a partir da **base** — a inversão acontece uma
única vez, no carimbo (NODE-033), nem aqui nem no navegador. Fazer a conversão em
dois lugares é como se inverte duas vezes e não se percebe.

**`page_width` e `page_height` em pontos, capturados na marcação.** Um mesmo PDF
pode misturar tamanhos de página; sem saber qual página a pessoa estava vendo, uma
fração não volta a ser posição, e a rubrica erra o lugar exatamente nas páginas
que diferem. Há teste com página em paisagem (842×595) no mesmo fluxo.

**A solicitação aponta para `document_version_id`, não só para o documento.** Uma
versão nova pode repaginar, então uma pendência da versão anterior não pode mais
ser honrada — é o que o NODE-031 vai cancelar.

## Autorização dividida em duas perguntas

Conflacionar as duas é como vaza escopo, então elas ficaram separadas:

- **Quem pode pedir** — autor do documento, administrador ou diretor.
- **Quem pode ser pedido** — apenas quem já alcança a obra do documento, decidido
  por `can_access_obra` de `app/scope.py`. A regra não é rederivada aqui.

Um efeito verificado: **um diretor pode ser indicado mesmo sem estar atribuído à
obra**, porque o papel tem acesso global no funil de escopo. Se eu tivesse
reescrito a checagem neste módulo, teria errado esse caso.

E quem está fora da obra recebe **404 ao tentar criar solicitação** — não 403 —
porque a existência do documento é escondida fora do escopo, como no resto da API.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Vínculo à versão + coordenadas 0..1 origem topo | EVD-001 |
| 2 | `page_width`/`page_height` em pontos | EVD-002 |
| 3 | Signatário fora da obra → 403, via `app/scope.py` | EVD-003 |
| 4 | Não-PDF recusa a solicitação | EVD-004 |
| 5 | Vários signatários, sem ordem | EVD-005 |
| 6 | Só autor, administrador ou diretor solicitam | EVD-006 |

## Detalhes de validação

A área é validada **duas vezes por motivos diferentes**: o schema Pydantic barra
valores fora de 0..1 antes de chegarem ao serviço, e o serviço confere que o
retângulo cabe inteiro na página (`x + largura <= 1`). Um retângulo que começa em
0,9 com largura 0,3 passa no primeiro e é barrado no segundo.

Pedir de novo à mesma pessoa na mesma versão dá **409**: é um pedido duplicado,
não uma segunda assinatura. Já pedir a pessoas diferentes é livre e **sem ordem** —
não existe coluna de sequência, e há teste afirmando isso, porque ordem
obrigatória foi explicitamente recusada no intake.

Documento sem arquivo enviado dá **409**: não há versão para ancorar coordenadas.

Signatário inexistente ou **inativo** dá 404.

## Limitações conhecidas

- **Nada consome a solicitação ainda.** Assinar é NODE-029, o e-mail é NODE-028,
  o cancelamento por nova versão é NODE-031 e a tela é NODE-035.
- **O `status` só existe em `pendente` por enquanto.** As outras transições chegam
  nos nós seguintes; o enum já as prevê para não migrar de novo.
- **Não há verificação de que a página existe no PDF.** Marcar a página 99 de um
  documento de 3 páginas é aceito; quem sabe a contagem é o visualizador, e
  descobri-la no servidor exigiria abrir o PDF — trabalho que pertence ao NODE-033,
  onde a biblioteca de leitura já estará presente. **Fica como pendência real**,
  não como esquecimento.
- Migração não executada contra PostgreSQL (mesma situação do NODE-026).
