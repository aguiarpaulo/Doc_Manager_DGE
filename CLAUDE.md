# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GED DGE — a document management system (Gestão Eletrônica de Documentos) for a
construction company, tracking documents (contracts, projects, invoices,
licenses, reports) per "obra" (construction site) with role-based access,
versioning, an approval workflow, and an audit trail.

- **API (backend):** FastAPI — `app/`
- **UI (frontend):** Streamlit, thin — `streamlit_app/`
- **Database:** PostgreSQL (SQLite in-memory for tests only)
- **File storage:** MinIO (S3-compatible)
- **HTTPS:** Caddy (automatic cert) — `docker/Caddyfile`
- **Migrations:** Alembic — `alembic/`

This project is driven by a Delivery Graph (`delivery-graph/`): demand,
requirements, and node-by-node evidence live there. `delivery-graph/graph.json`
is the source of truth for what's been built and what's still open (see the
`gaps` array).

## Commands

```powershell
uv sync --all-extras                # install deps (API, UI, dev tools) into .venv/

uv run pytest                       # run all tests — no Docker/Postgres/MinIO needed;
                                     # tests/conftest.py swaps in in-memory db/storage/email
uv run pytest tests/test_auth.py    # single file
uv run pytest -k login              # by test name substring

uv run ruff check .                 # lint
uv run ruff check --fix             # lint with autofix
uv run ruff format .                # format

uv run alembic upgrade head                       # apply migrations
uv run alembic revision --autogenerate -m "msg"   # new migration after model changes
uv run alembic downgrade -1                        # revert last migration

uv run python scripts/backup_postgres.py    # backup
uv run python scripts/restore_postgres.py   # restore
uv run python scripts/smoke_health.py             # manual smoke: /health against live services
uv run python scripts/smoke_minio_persistence.py  # manual smoke: storage survives container recreation
uv run python scripts/smoke_streamlit_ui.py       # manual smoke: drives the UI against the live stack;
                                     # GED_SMOKE_EMAIL / _PASSWORD / _FILE (a PDF to attach)
uv run python scripts/check_no_hardcoded_secrets.py  # asserts config comes from env, not literals

docker compose up --build           # full stack: API + Postgres + MinIO + Caddy (HTTPS)
docker compose up postgres minio    # infra only; needs a local override publishing 5432
                                     # plus GED_DATABASE_URL in .env — see README Option B
uv run streamlit run streamlit_app/app.py   # UI; talks to API via GED_API_URL (default localhost:8000)
```

There is no CI (no `.github/workflows/`) — run `pytest` and `ruff check .`
manually before committing.

## Architecture

**Request flow:** `app/main.py` wires five routers (`health`, `auth`, `users`,
`obras`, `documents`) from `app/api/*.py` onto one FastAPI app. Each router
file owns one resource's endpoints; cross-cutting concerns (auth, DB session,
access scope) are injected via `app/dependencies.py`.

**Access control is two-layered, and both layers matter:**
- **Role gating** (`require_admin` etc. in `app/dependencies.py`) — coarse,
  per-endpoint: only Admin manages users/obras; only Admin/Diretor
  approve-or-reject documents.
- **Obra scope** (`app/scope.py`) — fine-grained, per-row: Admin/Diretor see
  all obras; Engenheiro/Financeiro only see obras they're assigned to via the
  N:N user↔obra relation. This filtering must be applied in every
  document/obra query, not just enforced at the router layer — a role check
  alone does not confine an Engenheiro to their assigned obras.

**Document lifecycle** spans several models that all key off `document_id`:
`app/models/document.py` (metadata: nome, obra_id, categoria, status,
criado_por) → `app/models/document_version.py` (one row per re-upload; each
version has its own MinIO object, SHA-256 hash, and approval state) →
`app/models/audit.py` (immutable log, no update/delete path exposed via API).
Re-uploading a document creates a new version, resets status to `enviado`,
and does *not* delete prior versions' MinIO objects. Approval
(`app/services/approval.py`) is a state machine over
`enviado → em_analise → {aprovado, rejeitado}`; the creator of a document
can never approve/reject their own submission, and approval targets a
specific version, not the document as a whole.

**Storage** (`app/storage.py`) wraps MinIO: uploads are validated for type
(PDF/PNG/JPG only) and size (~50MB) before persisting, and a SHA-256 hash
match within the same obra is flagged as a duplicate rather than silently
re-stored.

**Auth** (`app/security.py`, `app/api/auth.py`): bcrypt password hashes, JWT
access + refresh tokens. The token payload is deliberately minimal — `sub`,
`type`, `iat`, `exp` — so anything needing the caller's role or e-mail must hit
`GET /auth/me`, which returns the current user via the same `get_current_user`
dependency every other endpoint uses. `app/services/password_reset.py` and
`app/services/mfa.py` (TOTP, opt-in) hang off the same user model but are
separate flows from the base login. `app/services/email.py` is a swappable
`EmailSender` protocol: `SMTPEmailSender` (stdlib `smtplib`, provider-agnostic)
sends real reset e-mails when `GED_SMTP_HOST` is set, otherwise
`ConsoleEmailSender` just logs the token for dev; tests swap in
`InMemoryEmailSender`. Selection lives in `get_email_sender`.

**Config** (`app/config.py`) reads everything from env vars prefixed `GED_`
(see `.env.example`); nothing is hardcoded, enforced by
`scripts/check_no_hardcoded_secrets.py`, which scans `docker-compose.yml` *and*
`scripts/` — the host-side scripts run against a live deployment, so a credential
baked into one of them authenticates against nothing. `GED_MINIO_ACCESS_KEY` /
`GED_MINIO_SECRET_KEY` are the single naming for the MinIO credential: compose hands
them to the MinIO server as its root user, and every client reads the same two names.

**First-admin bootstrap** (`app/services/bootstrap.py`, run by `docker/entrypoint.sh`
as `python -m app.bootstrap_admin` between `alembic upgrade head` and uvicorn):
`POST /users` is admin-only, so a fresh database would otherwise have no way to
produce its first login. `ensure_first_admin` creates one administrator from
`GED_BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD`, and is a no-op once *any* administrator
exists — so it never overwrites a password on restart. It validates the address with
the same `EmailStr` rule the login endpoint uses; a reserved domain like `.local`
raises and aborts container startup rather than seeding an admin nobody can log in as.

**Shell scripts must stay LF.** `docker/entrypoint.sh` is copied into a Linux image and
exec'd; a CRLF shebang makes the kernel look for `bash\r`. `.gitattributes` pins
`*.sh eol=lf` and `tests/test_container_build.py` guards it, because the pytest suite
otherwise never touches the Docker path.

**Streamlit UI** (`streamlit_app/app.py` + `api_client.py`) is a thin client with
no business logic of its own. Every HTTP call goes through `api_client`; the
render functions catch `requests.HTTPError` at the boundary and surface
`api_client.error_message(exc)`, which flattens both `detail` shapes FastAPI
emits (a string for business errors, a per-field list for 422).

The dashboard is tabbed. "Documentos" reproduces the SEI process screen: an
**obra plays the role of a process**, its documents are listed in inclusion order
(oldest first) on the left, and the selected one renders beside the list.
Rendering dispatches on the `Content-Type` the download endpoint returns, never
on the filename. "Administração" only exists for `administrador` — the UI learns
the role from `GET /auth/me` because the JWT carries only `sub`/`type`/`iat`/`exp`.
That tab stays reachable with zero obras on purpose: it is where the first one
is created, so an early return there would deadlock a fresh install.

**Testing the UI has a hard boundary.** `tests/test_streamlit_ui.py` drives the
real app through Streamlit's `AppTest`, but `AppTest` runs without
`streamlit.runtime.Runtime`, which is what registers frontend components. So
`st.pdf` (from the `streamlit[pdf]` extra) raises `StreamlitAPIException` under
`AppTest` and works in a real server; `st.image` is not queryable at all. Two
consequences: `render_content` wraps `st.pdf` in a `try/except` so a deploy
missing the extra degrades to a download button instead of killing the page, and
no test asserts that a PDF visually rendered — `scripts/smoke_streamlit_ui.py`
covers everything up to that point against the live stack, and the pixels need a
browser.

Related lesson recorded in `delivery-graph/demands/DEM-001/evidence/NODE-015/`:
that node's contract demanded a *manual* smoke, but the evidence filed was pytest
with `api_client` mocked. Mocked runs never exercise the types the API validates,
which is how a `text_input` for a `uuid.UUID` field shipped and made every upload
return 422. Do not file a mocked test run as smoke evidence.

## Known limitations (from README, still true)

- **Option B (local API + Docker infra) does not work as written.** The `postgres`
  service publishes no host port, and `GED_DATABASE_URL`'s built-in default
  (`ged:ged`) does not match a generated `.env`. Needs a local compose override.
- **No test coverage measurement** (`pytest-cov` not configured).
- **No automated end-to-end tests** against real Postgres/MinIO — tests use
  in-memory fakes; the `scripts/smoke_*.py` scripts are manual-only.
- **`diretor` cannot administer anything.** `POST /obras`, `POST /users` and
  `PUT/DELETE /obras/{obra}/users/{user}` are all `require_admin`, so the
  "Administração" tab is administrator-only. Widening it to Diretor means
  changing those authorization rules, not just the UI condition.
- **The login screen leaves orphan widgets in `AppTest`.** `render_login` ends in
  `st.rerun()`, and the harness keeps nodes from the pre-rerun pass, which breaks
  the next interaction. A real browser replaces the tree, so this is harness-only;
  `scripts/smoke_streamlit_ui.py` works around it by starting a fresh `AppTest`
  with the token already in `session_state` after proving login.
