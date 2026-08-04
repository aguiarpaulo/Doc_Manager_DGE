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
`test_observability`, `test_streamlit_ui`, `test_scaffold`, `test_bootstrap_admin`,
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

### Rodar a interface Streamlit

Com a API já no ar (`http://localhost:8000`):

```powershell
uv run streamlit run streamlit_app/app.py
```

A UI usa a variável `GED_API_URL` para achar a API (padrão: `http://localhost:8000`).

#### Organização da tela

A interface tem duas abas:

- **Enviar documento** — o formulário de criação e upload.
- **Documentos** — consulta no layout do [SEI](https://softwarepublico.gov.br/social/sei/manuais/manual-do-usuario/3.-operacoes-basicas-com-processos),
  onde a **obra faz o papel do processo**: escolhida a obra, os documentos aparecem
  em coluna à esquerda "organizados por ordem de inclusão, na vertical" (mais antigo
  no topo, mais recente no fim), numerados. Clicar em um documento o destaca e abre o
  conteúdo à direita, embutido na própria página — PDF no visualizador nativo do
  Streamlit, imagens em `st.image`, e botão de download sempre disponível.

O visualizador de PDF exige o extra `streamlit[pdf]` (pacote `streamlit-pdf`), já
declarado nas dependências. Se ele faltar no ambiente, a página não quebra: o
documento continua baixável e a UI avisa qual extra instalar.

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
import requests
from streamlit_app import api_client

token = api_client.login("admin@exemplo.com.br", "SUA_SENHA")["access_token"]
for i in range(1, 6):
    requests.post(
        "http://localhost:8000/obras",
        headers={"Authorization": f"Bearer {token}"},
        json={"nome": f"Obra {i:02d}", "descricao": ""},
        timeout=30,
    ).raise_for_status()
PY
```

#### Erros da API na interface

Falhas de `GET /documents`, `GET /obras` e do envio de documentos aparecem como
`st.error` com a mensagem que a API devolveu, em vez de estourar traceback na tela.
`streamlit_app.api_client.error_message` normaliza os dois formatos de `detail` que o
FastAPI produz: texto (erros de negócio, ex.: 409 de hash duplicado na mesma obra) e
lista de erros por campo (validação, 422).

---

## Verificação rápida (smoke tests)

Checagens manuais de que a infra está viva (rode com os serviços no ar):

```powershell
uv run python scripts/smoke_health.py              # a API responde? (/health)
uv run python scripts/smoke_minio_persistence.py   # o armazenamento funciona?
uv run python scripts/smoke_streamlit_ui.py        # a UI faz login, lista obras e sobe arquivo?
```

O endpoint `/health` também retorna o status do banco e do armazenamento em JSON.

`smoke_streamlit_ui.py` executa `streamlit_app/app.py` no harness `AppTest` do
Streamlit **sem nenhum mock**, então cada chamada vai para a API, o PostgreSQL e o
MinIO reais. É o smoke exigido pelo contrato de validação do NODE-015: a suíte de
`pytest` sozinha não serve, porque ela mocka o `api_client` e portanto nunca exercita
os tipos que a API valida de verdade. Configure com `GED_SMOKE_EMAIL`,
`GED_SMOKE_PASSWORD` e `GED_SMOKE_FILE` (caminho de um PDF para anexar); cada execução
acrescenta bytes únicos ao arquivo, porque a API rejeita com 409 um upload cujo hash já
exista na mesma obra.

O smoke cobre login, envio, a árvore de documentos da obra e a abertura do documento
no visualizador. O que ele **não** cobre é o desenho do PDF na tela: `st.pdf` é um
componente de frontend e o `AppTest` roda sem o runtime que registra componentes, então
nesse caminho a UI cai no aviso de visualizador indisponível. A renderização visual só
se confirma abrindo a aplicação no navegador.

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
streamlit_app/  # Interface Streamlit
tests/          # Testes automáticos (pytest)
alembic/        # Migrações de banco
scripts/        # Backup, restore e smoke tests
docker/         # Configuração do Caddy (HTTPS)
```
