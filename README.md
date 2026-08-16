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

É a forma principal de verificar o sistema. São ~70 testes que **não precisam de
Docker, Postgres nem MinIO** — o `tests/conftest.py` substitui banco, armazenamento e
e-mail por versões em memória.

```powershell
uv run pytest                       # roda todos os testes
uv run pytest -v                    # com detalhes de cada teste
uv run pytest tests/test_auth.py    # só um arquivo
uv run pytest -k login              # só testes cujo nome contém "login"
```

Cada arquivo em `tests/` cobre uma área: `test_auth`, `test_users`, `test_obras`,
`test_documents`, `test_uploads`, `test_versioning`, `test_approval`, `test_mfa`,
`test_password_reset`, `test_search`, `test_soft_delete`, `test_audit`,
`test_observability`, `test_scaffold`, `test_bootstrap_admin`,
`test_container_build`, `test_operational_scripts`.

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
> publica a porta 5432 no host (só o MinIO publica 9000/9001), de propósito: o compose é
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

**Remover e editar:**

| Ação | O que acontece de fato |
| --- | --- |
| Revogar acesso a uma obra | Remoção real do vínculo `user_obra`. Não há histórico a preservar aqui. |
| Alterar papel do usuário | `PATCH /users/{id}`. Muda a autorização na hora, na requisição seguinte. |
| Desativar / reativar usuário | `is_active`. Tira o login imediatamente e **preserva** autoria dos documentos, trilha de auditoria e vínculos com obras. Reativar devolve tudo. |
| Arquivar / restaurar obra | `is_deleted` na obra. Ela sai das listagens de todo mundo e deixa de aceitar documentos novos; documentos, arquivos no MinIO e vínculos ficam intactos e voltam ao restaurar. |

Nada é apagado do banco por essas ações, e isso é deliberado: `documents.criado_por` e
`audit_logs.actor_id` referenciam `users.id` sem `ON DELETE`, e o `/auth/login` grava
auditoria — então apagar um usuário que já entrou uma vez violaria integridade
referencial ou destruiria a trilha, que é imutável por contrato. Arquivar obra em vez de
apagar evita o outro lado do problema: `documents.obra_id` tem `ON DELETE CASCADE`, então
um `DELETE` na obra apagaria os documentos em silêncio e deixaria os arquivos órfãos no
MinIO, que nenhum código remove.

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

## Verificação rápida (smoke tests)

Checagens manuais de que a infra está viva (rode com os serviços no ar):

```powershell
uv run python scripts/smoke_health.py              # a API responde? (/health)
uv run python scripts/smoke_minio_persistence.py   # o armazenamento funciona?
```

O endpoint `/health` também retorna o status do banco e do armazenamento em JSON.

A jornada da interface é verificada de duas formas, ambas **sem mock**:

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

`GED_MINIO_ACCESS_KEY` e `GED_MINIO_SECRET_KEY` são o **único** par de nomes para a
credencial do MinIO: o compose entrega esses valores ao servidor MinIO como credencial
root, e todo cliente (API no Docker, API rodando local, scripts de smoke) lê as mesmas
duas variáveis. Não existem mais `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` — se o seu
`.env` for antigo e ainda usar esses nomes, o compose para com uma mensagem dizendo
qual variável falta.

O `docker-compose.yml` também usa `POSTGRES_*` e `CADDY_DOMAIN` (ver `.env.example`).

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
- **Sem testes de ponta a ponta automáticos** contra Postgres/MinIO reais — os testes
  usam versões em memória; os scripts de smoke são manuais.

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
