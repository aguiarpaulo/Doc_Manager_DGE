# GED DGE — Gestão Eletrônica de Documentos para Obras

Sistema para gerenciar documentos de obras: usuários com papéis, obras, upload de
arquivos, versionamento, fluxo de aprovação, MFA e auditoria.

- **API (backend):** FastAPI — código em `app/`
- **UI (frontend):** SPA React + TypeScript (Vite) — código em `frontend/`
- **Banco de dados:** PostgreSQL (SQLite em memória apenas nos testes)
- **Armazenamento de arquivos:** MinIO (compatível com S3)
- **HTTPS:** Caddy (certificado automático)
- **Migrações:** Alembic

---

## Requisitos

- [Python 3.12+](https://www.python.org/)
- [uv](https://docs.astral.sh/uv/) (gerenciador de dependências)
- [Docker](https://www.docker.com/) + Docker Compose — só para rodar o sistema completo
  (Postgres + MinIO). **Não é necessário para rodar os testes.**

---

## Instalação

```powershell
uv sync --all-extras     # instala dependências (API, UI e ferramentas de dev)
```

Isso cria o ambiente virtual em `.venv/`.

---

## Rodar os testes ✅

É a forma principal de verificar o sistema. São ~256 testes que **não precisam de
Docker, Postgres nem MinIO** — o `tests/conftest.py` substitui banco, armazenamento e
e-mail por versões em memória.

```powershell
uv run pytest                       # roda todos os testes
uv run pytest -v                    # com detalhes de cada teste
uv run pytest tests/test_auth.py    # só um arquivo
uv run pytest -k login              # só testes cujo nome contém "login"
```

Cada arquivo em `tests/` cobre uma área. Núcleo de documentos: `test_auth`,
`test_users`, `test_obras`, `test_documents`, `test_uploads`, `test_versioning`,
`test_approval`, `test_mfa`, `test_password_reset`, `test_search`,
`test_soft_delete`, `test_audit`, `test_document_timeline`. Assinatura e rubrica:
`test_signatures`, `test_signature_requests`, `test_signing`,
`test_signature_decline_cancel`, `test_signature_request_email`,
`test_new_version_cancels_requests`, `test_pdf_stamp`, `test_email`. Infra e
operação: `test_observability`, `test_scaffold`, `test_bootstrap_admin`,
`test_container_build`, `test_operational_scripts`, `test_cors`,
`test_storage_minio_live`, `test_delivery_graph`.

Os três últimos protegem o caminho do Docker, que o resto da suíte não exercita: eles
checam o artefato que sobe no container (o entrypoint precisa ter fim de linha LF, senão
o kernel Linux procura um interpretador chamado `bash\r`) e que os scripts de host leem
credenciais da configuração em vez de carregarem as suas próprias.

### Checar qualidade do código (lint)

```powershell
uv run ruff check .      # aponta problemas
uv run ruff check --fix  # corrige o que dá pra corrigir automaticamente
uv run ruff format .     # formata o código
```

---

## Rodar o sistema completo (teste manual)

### Opção A — Tudo via Docker (Postgres + MinIO + API + HTTPS)

1. Crie o arquivo de ambiente e ajuste as senhas:

   ```powershell
   copy .env.example .env
   ```

   Edite o `.env` e troque **todas** as senhas/segredos por valores fortes. Preste
   atenção em `GED_BOOTSTRAP_ADMIN_EMAIL` e `GED_BOOTSTRAP_ADMIN_PASSWORD`: é com esse
   par que você vai fazer o primeiro login. O e-mail precisa ser um endereço válido de
   verdade — domínios reservados como `.local` e `.test` são recusados, e a API se
   recusa a subir com um admin que ninguém conseguiria usar.

2. Suba os serviços:

   ```powershell
   docker compose up --build
   ```

   Na primeira subida a API aplica as migrações e cria o administrador inicial. Nas
   seguintes ela detecta que já existe um administrador e não mexe em nada.

3. Acesse:
   - API: <http://localhost:8000>
   - **Documentação interativa da API: <http://localhost:8000/docs>** — dá pra testar
     cada endpoint direto no navegador. Comece por `POST /auth/login` com as credenciais
     do `GED_BOOTSTRAP_ADMIN_*`; o `access_token` da resposta destrava o resto.
   - HTTPS via Caddy: <https://localhost> (certificado interno em `localhost`, então o
     navegador avisa; `http://localhost` redireciona com 308)
   - Console do MinIO: <http://localhost:9001>

#### Backup diário automático (opcional)

O `docker compose up` acima **não** inclui a rotina de backup. Ela vive num overlay
separado e precisa ser pedida explicitamente:

```powershell
docker compose -f docker-compose.yml -f docker-compose.backup.yml up -d
```

### Opção B — API local + Postgres/MinIO no Docker

Útil no dia a dia de desenvolvimento (recarrega o código sozinho).

> **Atenção — não funciona direto.** O serviço `postgres` do `docker-compose.yml` não
> publica a porta 5432 no host (publicam a API em 8000, o MinIO em 9000/9001 e o Caddy em 80/443), de propósito: o compose é
> o arquivo de deploy e expor o banco não é o padrão desejável em produção. Rodando a
> API na sua máquina, o passo 2 abaixo dá timeout de conexão. Para usar a Opção B você
> precisa, **localmente**, publicar a porta e apontar a URL do banco:
>
> 1. crie um `docker-compose.override.yml` (não versionado) publicando `5432:5432` no
>    serviço `postgres`;
> 2. acrescente ao `.env` um `GED_DATABASE_URL` com a mesma senha de `POSTGRES_PASSWORD`
>    — o padrão embutido é `ged:ged`, que não bate com o `.env` gerado.
>
> Sem esses dois passos, use a Opção A.

```powershell
# 1. Suba só a infraestrutura
docker compose up postgres minio

# 2. Aplique as migrações do banco
uv run alembic upgrade head

# 3. Rode a API com reload
uv run uvicorn app.main:app --reload
```

### Rodar a interface (SPA)

Com a API no ar (`http://localhost:8000`):

```powershell
cd frontend
npm install
npm run dev
```

O Vite sobe em `http://localhost:5173`. A SPA acha a API por `VITE_API_BASE_URL`
(padrão `/api`); em desenvolvimento aponte-a para a API direta:

```powershell
$env:VITE_API_BASE_URL = "http://localhost:8000"; npm run dev
```

> **Atenção — CORS.** A SPA em `:5173` e a API em `:8000`/`:8080` são origens
> diferentes. Sem autorização explícita o navegador barra toda chamada no
> preflight e a tela de login mostra "Não foi possível falar com o servidor".
> Defina `GED_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` — no
> `.env` (Opção A e B) ou como variável de ambiente antes de `uv run uvicorn`
> (Opção B lê o `.env` diretamente, sem precisar reiniciar o Docker). Em
> produção a variável fica vazia: lá o Caddy serve a SPA e a API na mesma
> origem, então não existe chamada cruzada a autorizar.
>
> **Caminho mais rápido para só rodar a SPA localmente:** suba
> `docker-compose.test.yml` (ver [Testes de ponta a ponta](#testes-de-ponta-a-ponta-e2e)
> abaixo) — ele já publica a API em `:8080` com `GED_CORS_ORIGINS` liberado
> para `:5173`, então basta `VITE_API_BASE_URL=http://localhost:8080/api npm run dev`.

Comandos do frontend:

```powershell
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest (não precisa de serviço nenhum)
npm run build       # tsc --noEmit && vite build; falha se houver erro de tipo
```

Os testes de integração (`*.integration.test.ts`) ficam desativados por padrão e
só rodam com `GED_LIVE_API=1` apontando para uma API de pé. São eles que
exercitam os tipos que o backend valida de verdade.

#### Organização da tela

A tela reproduz o layout do [SEI](https://softwarepublico.gov.br/social/sei/manuais/manual-do-usuario/3.-operacoes-basicas-com-processos),
onde a **obra faz o papel do processo**: escolhida a obra, os documentos aparecem
em coluna à esquerda em ordem de inclusão (mais antigo no topo), numerados. Clicar
em um documento o destaca e abre o conteúdo à direita, na própria página. A
renderização despacha pelo `Content-Type` que o download devolve, nunca pela
extensão: PDF e imagens têm prévia, os demais tipos caem no botão de download.

A obra e o documento abertos vivem na URL, então a tela é compartilhável e o F5
restaura exatamente o que estava aberto.

#### Pré-requisito: obras cadastradas

O formulário "Novo documento" oferece um seletor com as obras que o usuário logado
pode acessar, buscadas em `GET /obras`. Só um **administrador** cria obras
(`POST /obras` exige o papel `administrador`), e `GET /obras` é filtrado pelo escopo
de quem chama — um usuário sem obra atribuída vê a lista vazia e a UI avisa que é
preciso pedir o cadastro a um administrador, em vez de oferecer um formulário que a
API vai recusar.

Cadastro das obras iniciais, autenticado com as credenciais de `GED_BOOTSTRAP_ADMIN_*`:

```powershell
uv run python - <<'PY'
import json, urllib.request

BASE = "http://localhost:8000"

def chamar(caminho, corpo, token=None):
    cabecalhos = {"Content-Type": "application/json"}
    if token:
        cabecalhos["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{BASE}{caminho}", data=json.dumps(corpo).encode(), headers=cabecalhos
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)

token = chamar("/auth/login", {"username": "admin", "password": "SUA_SENHA"})["access_token"]
for i in range(1, 6):
    chamar("/obras", {"nome": f"Obra {i:02d}", "descricao": ""}, token)
PY
```

#### Aba "Administração" (só administrador)

Quem entra com o papel `administrador` ganha uma terceira aba. A UI descobre o papel
por `GET /auth/me` — o JWT carrega apenas `sub`, `type`, `iat` e `exp`, sem papel. Os
demais papéis não veem a aba.

**Cadastrar:** obra, usuário, e conceder a um usuário acesso a uma obra.

##### Cadastrar e remover um usuário

**Pela interface**, na aba Administração: preencha usuário, e-mail, senha (**duas
vezes** — as duas precisam bater antes de a chamada à API acontecer) e o papel, e
clique em "Criar usuário". A ação de remoção na tabela de usuários é **desativar**,
não apagar — ver por quê logo abaixo.

**Pela API**, com o token de um administrador:

```powershell
uv run python - <<'PY'
import json, urllib.request

BASE = "http://localhost:8000"

def chamar(caminho, corpo, token, metodo="POST"):
    req = urllib.request.Request(
        f"{BASE}{caminho}",
        data=json.dumps(corpo).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method=metodo,
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)

token = json.loads(urllib.request.urlopen(
    urllib.request.Request(
        f"{BASE}/auth/login",
        data=json.dumps({"username": "admin", "password": "SUA_SENHA"}).encode(),
        headers={"Content-Type": "application/json"},
    ),
    timeout=30,
).read())["access_token"]

# Cadastrar — POST /users. role: administrador | diretor | engenheiro | financeiro
novo = chamar("/users", {
    "username": "novo.usuario",
    "email": "novo.usuario@empresa.com",
    "password": "senha-forte-o-bastante",
    "role": "engenheiro",
}, token)
print("criado:", novo["id"], novo["username"])

# "Remover" — PATCH /users/{id} com is_active: false. Não existe DELETE /users/{id}.
chamar(f"/users/{novo['id']}", {"is_active": False}, token, metodo="PATCH")
print("desativado:", novo["username"])
PY
```

**Não existe endpoint `DELETE /users/{id}`, de propósito.** `documents.criado_por` e
`audit_logs.actor_id` referenciam `users.id` sem `ON DELETE`, e o próprio
`/auth/login` grava uma linha de auditoria — então apagar de verdade um usuário que
já entrou uma vez violaria integridade referencial ou destruiria a trilha, que é
imutável por contrato. `PATCH /users/{id}` com `is_active: false` é a forma
suportada de "remover": tira o login na hora e **preserva** autoria de documentos,
auditoria e vínculos com obras — reativar (`is_active: true`) devolve tudo.

**Remover e editar (visão geral):**

| Ação | O que acontece de fato |
| --- | --- |
| Revogar acesso a uma obra | Remoção real do vínculo `user_obra`. Não há histórico a preservar aqui. |
| Alterar papel do usuário | `PATCH /users/{id}`. Muda a autorização na hora, na requisição seguinte. |
| Desativar / reativar usuário | `is_active`. Tira o login imediatamente e **preserva** autoria dos documentos, trilha de auditoria e vínculos com obras. Reativar devolve tudo. |
| Arquivar / restaurar obra | `is_deleted` na obra. Ela sai das listagens de todo mundo e deixa de aceitar documentos novos; documentos, arquivos no MinIO e vínculos ficam intactos e voltam ao restaurar. |

Nada é apagado do banco por essas ações — a razão para usuário está acima; para obra
é o espelho: `documents.obra_id` tem `ON DELETE CASCADE`, então um `DELETE` real na
obra apagaria os documentos em silêncio e deixaria os arquivos órfãos no MinIO, que
nenhum código remove. Arquivar (`is_deleted`) evita isso.

Obra arquivada some via [app/scope.py](app/scope.py), o funil por onde toda query de
obra e documento passa — inclusive para `administrador` e `diretor`, que têm acesso
global. Para alcançar uma obra arquivada e restaurá-la existe `GET /obras?arquivadas=true`,
restrito a administrador.

**Um administrador não consegue reduzir os próprios privilégios** (desativar a própria
conta ou tirar de si o papel de administrador): as duas coisas responderiam 403. É a
única via capaz de deixar o sistema sem ninguém que o administre — um admin agindo sobre
*outro* admin continua sendo um admin ativo depois da ação.

A concessão de acesso só muda o que `engenheiro` e `financeiro` enxergam:
`administrador` e `diretor` já têm acesso global a todas as obras.

O `diretor` **não** vê a aba. As operações são `require_admin` na API, então uma aba
visível para ele teria todos os botões devolvendo 403. Para mudar isso é preciso ampliar
a autorização de `POST /obras`, `POST /users` e das rotas de vínculo.

#### Erros da API na interface

Falhas de `GET /documents`, `GET /obras` e do envio de documentos aparecem como
alerta com a mensagem que a API devolveu, em vez de estourar erro na tela.
`frontend/src/data/errors.ts` normaliza os dois formatos de `detail` que o FastAPI
produz: texto (erros de negócio, ex.: 409 de hash duplicado na mesma obra) e lista
de erros por campo (validação, 422) — neste caso os campos ficam disponíveis à parte,
para o formulário destacar qual deles falhou.

A UI nunca inspeciona o status HTTP: ela decide pela `category` do
`ApplicationError` (`autenticacao`, `autorizacao`, `validacao`, `conflito`,
`nao-encontrado`, `indisponivel`, `rede`, `cancelado`). O conhecimento de protocolo
não sai da fronteira de dados.

---

## Testes de ponta a ponta (E2E)

`frontend/e2e/` tem quatro jornadas Playwright que rodam em navegador real (Chromium)
contra o stack inteiro — Caddy servindo a SPA já compilada, FastAPI, PostgreSQL, MinIO
e Mailpit. **Nada aqui é simulado.** É o mesmo `docker-compose.test.yml` que serve para
só levantar a SPA localmente (ver nota de CORS acima).

```powershell
docker compose -f docker-compose.test.yml -p gede2e up -d --build
cd frontend
npx playwright test                          # todas as jornadas
npx playwright test e2e/leitura-de-pdf.spec.ts  # uma só
docker compose -f docker-compose.test.yml -p gede2e down -v   # desligar
```

Não há `webServer` na configuração do Playwright de propósito: o alvo é a SPA
**construída**, como em produção, não o `vite dev`. As quatro jornadas:

| Arquivo | O que prova |
| --- | --- |
| `jornada-de-assinatura.spec.ts` | Login → marcar área no PDF → e-mail no Mailpit → assinar com senha → linha do tempo → PDF carimbado baixado |
| `recusa-e-rubrica.spec.ts` | Recusar assinatura com justificativa; apagar a rubrica sem invalidar assinatura já feita |
| `recuperacao-de-senha.spec.ts` | Pedir redefinição → link do e-mail abre a tela → senha nova entra, a antiga não |
| `leitura-de-pdf.spec.ts` | O documento é **desenhado** na tela (conta pixels), não só que os elementos existem |

Só há um navegador configurado (Chromium) e nada roda em CI — são manuais.

## Verificação rápida (smoke tests)

Checagens manuais de que a infra está viva (rode com os serviços no ar):

```powershell
uv run python scripts/smoke_health.py              # a API responde? (/health)
uv run python scripts/smoke_minio_persistence.py   # o armazenamento funciona?
```

O endpoint `/health` também retorna o status do banco e do armazenamento em JSON.

A jornada da interface é verificada de três formas, todas **sem mock**:

- Os specs Playwright acima — os únicos que provam algo desenhado na tela (um
  traço no canvas, um PDF renderizado, um retângulo arrastado com o mouse).
- `frontend/src/data/*.integration.test.ts` — roda a fronteira de dados real
  contra a API de pé (`GED_LIVE_API=1`). Cobre login, ciclo de vida de documento
  com MinIO real e as regras administrativas.
- O smoke de `docker compose` documentado em
  `delivery-graph/demands/DEM-002/evidence/NODE-024/` — percorre login, criação de
  obra e documento, upload, listagem e download através do Caddy, com PostgreSQL e
  MinIO reais.

Essa separação existe por causa da lição registrada no NODE-015: a suíte de
componentes simula a fronteira HTTP e por isso **não serve como evidência de
smoke** — foi assim que um campo de texto onde a API valida `uuid.UUID` chegou a
fazer todo upload retornar 422.

---

## Banco de dados (migrações)

```powershell
uv run alembic upgrade head                        # aplica todas as migrações
uv run alembic revision --autogenerate -m "msg"    # gera nova migração após mudar modelos
uv run alembic downgrade -1                         # desfaz a última migração
```

## Backup e restauração do Postgres

```powershell
uv run python scripts/backup_postgres.py
uv run python scripts/restore_postgres.py
```

---

## Deploy em produção

`.github/workflows/deploy.yml` builda e publica a cada push na `main`: `test` (pytest,
ruff, lint/typecheck/testes/build do frontend) → `build-and-push` (builda as imagens da
API e da Web, publica em `ghcr.io/aguiarpaulo/ged-dge-api` e `-web`) → `deploy` (SSH no
servidor, `docker compose pull` + `up -d`). O servidor nunca builda nada — só puxa as
imagens já prontas, o que evita competir por CPU/RAM com Postgres e MinIO rodando ao
lado. Isso funciona com qualquer VM alcançável por SSH: um Droplet da DigitalOcean, uma
VM Oracle Cloud Always Free, ou qualquer outra.

### Provisionamento do servidor (uma vez só, manual)

1. Abra as portas 80 e 443 para a internet (e mantenha a 22/SSH restrita a você). Numa
   VM Oracle, quem decide isso é a Security List/Network Security Group do OCI, que por
   padrão bloqueia tudo além de SSH — esquecê-la é o motivo nº 1 de "configurei tudo e
   não abre no navegador" nesse provedor.

   O firewall do SO **não** entra nessa conta: o Docker redireciona as portas que publica
   na tabela `nat`, antes de o tráfego chegar às regras de `INPUT` do `iptables` (ou do
   `ufw`). Isso vale nos dois sentidos — não é preciso liberar 80/443 no `iptables` para
   o Caddy funcionar, e o firewall do SO também **não protege** nenhuma porta publicada
   por container. Por isso o `docker-compose.prod.yml` remove (`ports: !reset []`) as
   portas que o compose base publica para desenvolvimento (API 8000, MinIO 9000/9001):
   em produção só o Caddy (80/443) fica exposto. API e MinIO continuam falando entre si
   pela rede interna do compose; o console do MinIO não fica acessível de fora.

   Nas imagens Ubuntu da Oracle, **não use `ufw`**: a Oracle documenta que ele pode
   apagar as regras de acesso ao volume de boot (iSCSI), e a instância não volta do
   reboot. Se algum dia precisar mexer no firewall do SO, edite `/etc/iptables/rules.v4`.
2. Instale o Docker Engine + plugin `docker compose` na VM (por exemplo
   `curl -fsSL https://get.docker.com | sh`, depois `sudo usermod -aG docker ubuntu` e
   um novo login). O compose precisa ser **2.24.4 ou mais novo** (`docker compose
   version`): uma versão sem suporte a `!reset` pode ignorar a tag em silêncio e manter
   as portas da API e do MinIO publicadas. O passo 6 confere isso.
3. Copie `docker-compose.yml`, `docker-compose.prod.yml` e a pasta `docker/` (só o
   `Caddyfile` é necessário) para `/opt/ged` na VM. Se você quiser o backup diário
   automático (seção "Backup diário automático" acima), copie `docker-compose.backup.yml`
   também — o script de deploy detecta o arquivo e o inclui sozinho; sem ele, o backup
   simplesmente não roda (e não quebra nada). **O pipeline não atualiza esses arquivos**
   — ele só puxa imagens. Quando algum deles mudar no repositório, copie de novo à mão.
4. Crie `/opt/ged/.env` com os segredos de produção — copie de `.env.example`, gere
   valores reais para cada `change-me-*` e ajuste `CADDY_DOMAIN` para o domínio real
   (necessário para o Caddy emitir certificado Let's Encrypt automático). Acrescente
   também `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml` (mais
   `:docker-compose.backup.yml` se você copiou o backup): o compose lê essa variável do
   `.env`, então qualquer `docker compose ...` digitado à mão em `/opt/ged` — inclusive o
   de `scripts/smoke_minio_persistence.py` — usa o mesmo conjunto de arquivos do deploy.
   Sem ela, um `docker compose up -d minio` manual lê só o arquivo base e reabre as
   portas 9000/9001.
5. Aponte o DNS do domínio (registro A) para o IP público da VM.
6. Suba manualmente uma vez, para validar antes de depender do pipeline:
   ```bash
   cd /opt/ged
   docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```
   Na primeiríssima vez isso falha: o pipeline ainda não publicou nenhuma imagem em
   `ghcr.io`. Rode primeiro um push na `main` para o `build-and-push` publicar as
   imagens, **depois** volte e rode o passo 6. Para conferir, `https://SEU_DOMINIO/api/health`
   deve responder `"status":"ok"` — e `scripts/smoke_health.py`, se rodado contra o
   servidor, precisa de `GED_SMOKE_URL=https://SEU_DOMINIO/api/health`, porque o padrão
   dele (`localhost:8000`) não existe em produção. Confira também que só o Caddy está
   exposto — `docker ps --format '{{.Names}} {{.Ports}}'` deve mostrar `0.0.0.0` apenas
   nas portas 80 e 443 do `web`.
7. **GHCR nasce privado.** Depois do primeiro push bem-sucedido, abra
   `github.com/aguiarpaulo?tab=packages`, entre em cada pacote (`ged-dge-api` e
   `ged-dge-web`) → Package settings → Change visibility → **Public**. Sem isso o
   `docker compose pull` do passo 6 (e de todo deploy futuro) falha por falta de
   autenticação. Essa troca é **irreversível** — não dá para voltar a privado depois.
   As imagens não carregam segredo nenhum (tudo vem de env var em runtime), então isso
   é seguro.

### Secrets do GitHub (Settings → Secrets and variables → Actions)

| Secret | Valor |
|---|---|
| `DEPLOY_HOST` | IP público da VM |
| `DEPLOY_USER` | usuário SSH com permissão em `/opt/ged` (ex.: `ubuntu`) |
| `DEPLOY_SSH_KEY` | chave privada SSH (par dela precisa estar em `~/.ssh/authorized_keys` na VM) |

O acesso ao GHCR usa o `GITHUB_TOKEN` automático do Actions — não precisa criar nada
para isso.

### Testar de graça no Oracle Cloud Always Free

Antes de gastar dinheiro em produção de verdade, dá pra testar o stack inteiro sem
custo na VM sempre-grátis da Oracle:

1. Crie uma conta OCI (pede cartão de crédito para verificação, mas o tier Always Free
   não cobra nada a menos que você faça upgrade).
2. Crie uma instância **Ampere A1 (ARM)** — o tier grátis atual cobre até 2 OCPU / 12GB
   RAM, suficiente para os 4 containers deste projeto. Escolha uma imagem Ubuntu.
3. Siga o provisionamento acima — o passo do firewall (item 1) é ainda mais importante
   aqui, porque o padrão da Oracle é bloquear tudo.
4. Todas as imagens Docker usadas (`postgres:16-alpine`, `minio/minio`, `caddy:2-alpine`,
   `python:3.12-slim`, `node:24-alpine`) já publicam build para ARM64 — não precisa
   mudar nada no `Dockerfile` ou `docker/Dockerfile.web`.
5. A Oracle pode recuperar instâncias Always Free ociosas. Pela [documentação
   oficial](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm),
   ociosa é quando, num período de 7 dias, **todas** estas condições valem: CPU (percentil
   95) abaixo de 20%, rede abaixo de 20% e — só no A1 — memória abaixo de 20%. Este stack
   tende a usar bem menos de 20% dos 12 GB, então com pouco uso ele **é** ocioso por
   essa definição. Um cron batendo no `/health` não resolve: uma requisição a cada meia hora
   não move nenhuma das três métricas. As saídas reais são uso de verdade, ou fazer
   upgrade da conta para Pay As You Go — os recursos Always Free continuam sem custo, e
   a comunidade relata que contas PAYG não sofrem essa recuperação, mas a doc oficial
   atual **não** diz isso explicitamente. Se fizer o upgrade, crie um Budget com alerta
   (ex.: US$ 1) para ser avisado de qualquer cobrança acima do gratuito.
6. A [documentação oficial](https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm)
   hoje fixa o A1 Always Free em 2 OCPU / 12 GB no total (já foi 4 / 24), e diz que, se a
   tenancy passar disso, todas as instâncias A1 são desativadas. Crie a VM dentro de
   2/12. A instância só pode ser criada na *home region* escolhida no cadastro.

Quando decidir ir para produção de verdade, a Always Free vira opcional — o mesmo
pipeline aponta para qualquer VM só trocando os três secrets acima.

---

## Variáveis de ambiente

A API lê variáveis com prefixo `GED_` (do arquivo `.env`). Ver `app/config.py`.

| Variável               | Descrição                             | Padrão (dev)                                      |
| ---------------------- | ------------------------------------- | ------------------------------------------------- |
| `GED_ENVIRONMENT`      | `development` ou `production`         | `development`                                     |
| `GED_JWT_SECRET`       | Segredo do JWT (mín. 32 caracteres)   | valor inseguro de dev                             |
| `GED_DATABASE_URL`     | URL de conexão do Postgres            | `postgresql+psycopg://ged:ged@localhost:5432/ged` |
| `GED_MINIO_ENDPOINT`   | Endereço do MinIO                     | `localhost:9000`                                  |
| `GED_MINIO_ACCESS_KEY` | Usuário do MinIO                      | `minioadmin`                                      |
| `GED_MINIO_SECRET_KEY` | Senha do MinIO                        | `minioadmin`                                      |
| `GED_MINIO_BUCKET`     | Nome do bucket de documentos          | `documents`                                       |
| `GED_MINIO_SECURE`     | Usar HTTPS no MinIO (`true`/`false`)  | `false`                                           |
| `GED_BOOTSTRAP_ADMIN_USERNAME` | Login do administrador inicial | (derivado do e-mail)                     |
| `GED_BOOTSTRAP_ADMIN_EMAIL`    | E-mail do administrador inicial | (vazio — pula o bootstrap)              |
| `GED_BOOTSTRAP_ADMIN_PASSWORD` | Senha do administrador inicial (mín. 12 caracteres) | (vazio)   |
| `GED_CORS_ORIGINS`     | Origens liberadas para chamar a API de outro endereço, separadas por vírgula | (vazio — nenhuma) |
| `GED_SMTP_HOST`        | Servidor SMTP (ex.: `smtp.gmail.com`)  | (vazio — modo console: o token vai para o log) |
| `GED_SMTP_PORT`        | Porta SMTP                             | `587`                                             |
| `GED_SMTP_STARTTLS`    | Usar STARTTLS (`true`/`false`)         | `true`                                            |
| `GED_SMTP_USER`        | Usuário SMTP                           | (vazio)                                           |
| `GED_SMTP_PASSWORD`    | Senha SMTP (no Gmail, a senha de app)  | (vazio)                                           |
| `GED_SMTP_FROM`        | Remetente — com `GED_SMTP_HOST`, obrigatório se `GED_SMTP_USER` estiver vazio | (vazio) |
| `GED_APP_URL_BASE`     | URL pública usada nos links dos e-mails — obrigatória com `GED_SMTP_HOST` | (vazio) |

`GED_MINIO_ACCESS_KEY` e `GED_MINIO_SECRET_KEY` são o **único** par de nomes para a
credencial do MinIO: o compose entrega esses valores ao servidor MinIO como credencial
root, e todo cliente (API no Docker, API rodando local, scripts de smoke) lê as mesmas
duas variáveis. Não existem mais `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` — se o seu
`.env` for antigo e ainda usar esses nomes, o compose para com uma mensagem dizendo
qual variável falta.

O `docker-compose.yml` também usa `POSTGRES_*` e `CADDY_DOMAIN` (ver `.env.example`).

**O `.env` só chega à API pelo que está listado em `services.api.environment`** no
`docker-compose.yml` — não há `env_file:`. Uma variável nova em `app/config.py` precisa
ser acrescentada ali também, senão é ignorada em silêncio no container;
`tests/test_compose_api_env.py` falha (e bloqueia o deploy no CI) quando alguém esquece.

### E-mail pelo Gmail

1. Ative a verificação em duas etapas na conta Google e crie uma **senha de app** em
   <https://myaccount.google.com/apppasswords>. A senha normal da conta é recusada.
2. No `.env` do servidor, preencha o bloco SMTP do `.env.example` com `smtp.gmail.com`,
   porta `587`, a senha de app, `GED_SMTP_FROM` igual à própria conta Gmail e
   `GED_APP_URL_BASE` com a URL pública.
3. Na Oracle Cloud a porta 25 de saída é bloqueada; a 587 sai pela regra padrão.
   Confira na VM com `nc -vz smtp.gmail.com 587`.

**Testar o envio real localmente:** crie `docker-compose.local.yml` (está no
`.gitignore` — nunca versione, ele carrega a senha) sobrescrevendo `GED_SMTP_*` do
serviço `api`, e suba o stack local com ele por cima do de teste:

```powershell
docker compose -f docker-compose.test.yml -f docker-compose.local.yml -p gedlocal up -d --build
```

---

## Papéis de usuário e categorias

- **Papéis:** `administrador`, `diretor`, `engenheiro`, `financeiro`
- **Categorias de documento:** `contrato`, `projeto`, `nota_fiscal`, `licenca`,
  `laudo`, `outros`
- **Status de aprovação:** `enviado`, `em_analise`, `aprovado`, `rejeitado`

## Identificação do usuário

O login é um **nome de usuário**, não o e-mail: de 3 a 32 caracteres, sem espaços,
aceitando letras, números, ponto, hífen e sublinhado (`pauloaguiar` vale;
`paulo aguiar` não). É normalizado para minúsculas, então a caixa digitada não importa
no login. A regra vive em [app/usernames.py](app/usernames.py) e é a mesma usada pela
API e pelo bootstrap do primeiro administrador.

O **e-mail continua obrigatório** no cadastro, mas deixou de ser credencial: serve para
entregar o link de recuperação de senha. `GED_BOOTSTRAP_ADMIN_USERNAME` define o login
do administrador inicial; se não for informado, é derivado do trecho antes do `@` do
`GED_BOOTSTRAP_ADMIN_EMAIL`.

Na migração de um banco que já tinha usuários, o username sai do trecho antes do `@`.
Se dois e-mails colidirem (`admin@a.com` e `admin@b.com`), o mais antigo fica com o nome
limpo e os seguintes recebem sufixo numérico — confira com
`SELECT username, email FROM users;` depois de migrar.

No cadastro pela interface a senha é digitada **duas vezes** e as duas precisam bater
antes de a chamada à API acontecer.

## Tipos de arquivo aceitos no upload

PDF, PNG, JPEG, TXT, Word (`.doc`, `.docx`) e Excel (`.xls`, `.xlsx`), até 50 MB.
A lista real é `ALLOWED_CONTENT_TYPES` em [app/services/uploads.py](app/services/uploads.py)
e a validação é por *content type*, não por extensão — a extensão oferecida pela
interface é só conveniência, quem decide é a API. Só PDF e imagens têm pré-visualização;
os demais aparecem com botão de download.

---

## Limitações conhecidas

- **Sem CI.** Não há `.github/workflows/` — `pytest` e `ruff` precisam ser rodados
  manualmente antes de cada commit.
- **Sem medição de cobertura de testes** (`pytest-cov` não está configurado).
- **A suíte de ponta a ponta existe mas é manual e Chromium-only.** Os quatro specs em
  `frontend/e2e/` (ver [Testes de ponta a ponta](#testes-de-ponta-a-ponta-e2e)) rodam
  contra Postgres/MinIO/Mailpit reais, mas alguém precisa subir o
  `docker-compose.test.yml` e rodar `npx playwright test` à mão — nada dispara isso
  sozinho. A suíte do `pytest` continua usando versões em memória, e os scripts de
  smoke seguem manuais também.

---

## Estrutura do projeto

```
app/            # API FastAPI (rotas, modelos, schemas, serviços, storage)
frontend/       # SPA React + TypeScript (Vite)
tests/          # Testes automáticos (pytest)
alembic/        # Migrações de banco
scripts/        # Backup, restore e smoke tests
docker/         # Caddy (HTTPS + origem única) e build da imagem web
```
