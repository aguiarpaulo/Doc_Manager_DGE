# NODE-024 — Deploy da SPA na mesma origem

**Demanda:** DEM-002 · **Track:** TRK-spa-foundation · **Requisitos:** REQ-026, REQ-027
**Depende de:** NODE-022, NODE-023 (`done`) · **Contrato: 5/5**

## O que mudou na infraestrutura

| Arquivo | Mudança |
|---|---|
| `docker/Dockerfile.web` | **novo** — build Node do bundle + Caddy que o serve |
| `docker/Caddyfile` | Passou a servir estático e rotear `/api/*` para a API |
| `docker-compose.yml` | Serviço `caddy` virou `web`, agora construído |
| `frontend/.dockerignore` | **novo** |
| `.env.example` | `VITE_BASE_PATH` e `VITE_API_BASE_URL` documentadas |

O Node **não vai para a imagem final**: o estágio 1 compila, o estágio 2 é o
Caddy com os arquivos. Em produção roda um proxy e arquivos estáticos, sem
runtime de JavaScript no servidor.

## Contrato — 5/5

| # | Item | Evidência |
|---|---|---|
| 1 | Mesma origem, sem CORS | EVD-001 |
| 2 | Rota filha por acesso direto e F5 | EVD-002 |
| 3 | Chamada de API não duplica prefixo | EVD-003 |
| 4 | Build falha e não publica com erro de tipo | EVD-004 |
| 5 | Smoke real com login e listagem | EVD-005 |

## A peça central: `handle_path`

```
handle_path /api/* { reverse_proxy api:8000 }
```

`handle_path` **remove** o prefixo antes de repassar. A API monta seus routers na
raiz (`/auth`, `/obras`, `/documents`), então com `handle` comum o caminho
chegaria como `/api/auth/login` e daria 404. Verificado: 0 ocorrências de
`/api/api` no bundle servido e todos os endpoints respondendo 200/201.

O fallback `try_files {path} /index.html` é o que faz `/obras/{id}/documentos/{id}`
funcionar por acesso direto — sem ele, um F5 em rota filha daria 404 do
servidor de arquivos.

## Smoke: a jornada inteira contra serviços reais

```
login → /auth/me → criar obra → criar documento (obra_id UUID)
      → upload de PDF ao MinIO (SHA-256 devolvido)
      → listagem da obra (1 documento)
      → download HTTP 200 application/pdf 41 bytes
```

PostgreSQL e MinIO reais, tudo através do Caddy com TLS. `GET /api/health`
devolveu `{"database":"ok","storage":"ok"}`.

## Um falso alarme meu

A primeira execução do smoke deu `HTTP 000` no upload e 404 no download. Antes
de mexer em qualquer configuração, isolei: upload direto na API (porta 8000)
retornou **201**, e pelo Caddy retornou **409 "hash duplicado"** — ou seja, o
caminho funcionava e o 409 era o comportamento correto de duplicata. O `HTTP 000`
foi falha transitória do cliente, não do proxy. Refiz com conteúdo único e a
jornada passou inteira.

Vale como método: quando um smoke falha, isolar a camada antes de alterar
configuração — eu quase "consertei" um Caddy que não estava quebrado.

## Um problema pré-existente do ambiente

**O `.env` do repositório está desatualizado e `docker compose up` já falharia
hoje, antes desta mudança.** Ele traz `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` —
a nomenclatura antiga — enquanto o compose exige `GED_MINIO_ACCESS_KEY`/
`GED_MINIO_SECRET_KEY`, que o CLAUDE.md descreve como a nomenclatura unificada.
Faltam também as variáveis de bootstrap do administrador.

Não alterei o `.env` (contém segredos reais e a decisão é do dono). O smoke usou
um arquivo separado via `--env-file`, fora do repositório. **Ação pendente para o
operador:** alinhar o `.env` ao `.env.example`.

## Decisões

**Cache imutável só para os arquivos com hash no nome**; `index.html` vai com
`no-cache`, senão um deploy novo continuaria servindo o bundle antigo.

**Caminho-base e base da API são `ARG` de build**, não valores fixos: montar a
SPA sob um sub-caminho é configuração, não reescrita de código.

## Limitações conhecidas

- **A porta 8000 da API continua publicada no host.** Útil em desenvolvimento,
  mas em produção permite contornar o TLS do Caddy. Fechá-la é decisão de
  operação — não mexi, para não alterar comportamento existente sem pedido.
- **Rota desconhecida devolve 200 com o index**, e o "não encontrado" é decidido
  no cliente. É o comportamento normal de SPA; um 404 real exigiria o servidor
  conhecer as rotas.
- **O smoke é um script manual**, não automatizado. O E2E do NODE-040 cobre a
  jornada em navegador.
- **Sem orçamento de bundle bloqueante** (pendência herdada do NODE-018).
- O smoke roda em `localhost` com certificado interno; domínio e certificado de
  produção seguem como pendência não-bloqueante do GAP-002.
