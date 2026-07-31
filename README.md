# GED DGE — Gestão Eletrônica de Documentos para Obras

Sistema para gerenciar documentos de obras: usuários com papéis, obras, upload de
arquivos, versionamento, fluxo de aprovação, MFA e auditoria.

- **API (backend):** FastAPI — código em `app/`
- **UI (frontend):** Streamlit — código em `streamlit_app/`
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

É a forma principal de verificar o sistema. São ~60 testes que **não precisam de
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
`test_observability`, `test_streamlit_ui`, `test_scaffold`.

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

   Edite o `.env` e troque **todas** as senhas/segredos por valores fortes.

2. Suba os serviços:

   ```powershell
   docker compose up --build
   ```

3. Acesse:
   - API: <http://localhost:8000>
   - **Documentação interativa da API: <http://localhost:8000/docs>** — dá pra testar
     cada endpoint direto no navegador
   - Console do MinIO: <http://localhost:9001>

### Opção B — API local + Postgres/MinIO no Docker

Útil no dia a dia de desenvolvimento (recarrega o código sozinho).

```powershell
# 1. Suba só a infraestrutura
docker compose up postgres minio

# 2. Aplique as migrações do banco
uv run alembic upgrade head

# 3. Rode a API com reload
uv run uvicorn app.main:app --reload
```

### Rodar a interface Streamlit

Com a API já no ar (`http://localhost:8000`):

```powershell
uv run streamlit run streamlit_app/app.py
```

A UI usa a variável `GED_API_URL` para achar a API (padrão: `http://localhost:8000`).

---

## Verificação rápida (smoke tests)

Checagens manuais de que a infra está viva (rode com os serviços no ar):

```powershell
uv run python scripts/smoke_health.py              # a API responde? (/health)
uv run python scripts/smoke_minio_persistence.py   # o armazenamento funciona?
```

O endpoint `/health` também retorna o status do banco e do armazenamento em JSON.

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

O `docker-compose.yml` também usa `POSTGRES_*`, `MINIO_ROOT_*` e `CADDY_DOMAIN`
(ver `.env.example`).

---

## Papéis de usuário e categorias

- **Papéis:** `administrador`, `diretor`, `engenheiro`, `financeiro`
- **Categorias de documento:** `contrato`, `projeto`, `nota_fiscal`, `licenca`,
  `laudo`, `outros`
- **Status de aprovação:** `enviado`, `em_analise`, `aprovado`, `rejeitado`

---

## Limitações conhecidas

- **Não há criação do primeiro administrador.** A rota `POST /users` exige um usuário
  administrador já autenticado (`require_admin`), mas não existe script de seed nem
  bootstrap para criar o primeiro admin. Em um banco novo é preciso inserir o primeiro
  administrador manualmente (por SQL) para conseguir usar o sistema.
- **Sem CI.** Não há `.github/workflows/` — `pytest` e `ruff` precisam ser rodados
  manualmente antes de cada commit.
- **Sem medição de cobertura de testes** (`pytest-cov` não está configurado).
- **Sem testes de ponta a ponta automáticos** contra Postgres/MinIO reais — os testes
  usam versões em memória; os scripts de smoke são manuais.

---

## Estrutura do projeto

```
app/            # API FastAPI (rotas, modelos, schemas, serviços, storage)
streamlit_app/  # Interface Streamlit
tests/          # Testes automáticos (pytest)
alembic/        # Migrações de banco
scripts/        # Backup, restore e smoke tests
docker/         # Configuração do Caddy (HTTPS)
```
