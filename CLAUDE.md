# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GED DGE — a document management system (Gestão Eletrônica de Documentos) for a
construction company, tracking documents (contracts, projects, invoices,
licenses, reports) per "obra" (construction site) with role-based access,
versioning, an approval workflow, and an audit trail.

- **API (backend):** FastAPI — `app/`
- **UI (frontend):** React + TypeScript SPA (Vite) — `frontend/`
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
uv run python scripts/check_no_hardcoded_secrets.py  # asserts config comes from env, not literals

docker compose up --build           # full stack: API + Postgres + MinIO + Caddy (HTTPS)
docker compose up postgres minio    # infra only; needs a local override publishing 5432
                                     # plus GED_DATABASE_URL in .env — see README Option B
npm --prefix frontend install       # SPA deps (Node 24 / npm 11)
npm --prefix frontend run dev       # dev server on :5173; VITE_API_BASE_URL points at the API
npm --prefix frontend test          # vitest; needs no services
npm --prefix frontend run typecheck # tsc --noEmit
npm --prefix frontend run lint      # eslint
npm --prefix frontend run build     # tsc --noEmit && vite build — a type error fails the build

# Browser E2E — needs the test stack up first (nothing is mocked):
docker compose -f docker-compose.test.yml -p gede2e up -d --build
npx --prefix frontend playwright test        # or: cd frontend && npx playwright test
docker compose -f docker-compose.test.yml -p gede2e down -v   # tear down

# Integration tests hit a real API and are skipped unless GED_LIVE_API=1:
#   GED_LIVE_API=1 GED_LIVE_USER=admin GED_LIVE_PASSWORD=... #   VITE_API_BASE_URL=http://127.0.0.1:8000 npx vitest run src/data/documentos.integration.test.ts
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
  alone does not confine an Engenheiro to their assigned obras. All three
  helpers here also drop archived obras (`Obra.is_deleted`), *including* for the
  globally-scoped roles — that single funnel is what makes archiving hide an obra
  everywhere instead of merely flagging it. `search_documents` joins Obra for the
  same reason: the Admin/Diretor path skipped obra filtering entirely, so without
  the join their document list would still show an archived obra's documents.

**Nothing user- or obra-shaped is ever hard-deleted, and the FKs are why.**
`documents.criado_por` and `audit_logs.actor_id` reference `users.id` with no
`ON DELETE`, and `/auth/login` writes an audit row — so any user who has logged in
even once cannot be deleted without violating integrity or destroying the immutable
trail. Deactivation (`is_active`) is the supported answer, and it deliberately keeps
authorship, audit and obra assignments so reactivation restores everything.
Conversely `documents.obra_id` *does* cascade, so a real `DELETE` on an obra would
silently take its documents with it and orphan the MinIO objects, which nothing
cleans up; obras are archived (`is_deleted`) instead. `GET /obras?arquivadas=true`
is admin-only and exists solely so an archived obra stays reachable for restore.

**An administrator cannot reduce their own privileges** (`app/api/users.py`):
self-deactivation and stripping one's own administrator role both 403. Acting on a
*different* admin is always safe — the caller is still an active admin afterwards —
so self-action is the only path that can leave the system with zero administrators.
A "last active administrator" check would be unreachable code.

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

**Storage** (`app/storage.py`) wraps MinIO: uploads are validated for type and size
(~50MB) before persisting, and a SHA-256 hash match within the same obra is flagged as
a duplicate rather than silently re-stored. `ALLOWED_CONTENT_TYPES` in
`app/services/uploads.py` is the real gate — PDF, PNG, JPEG, plain text, Word and Excel
— and it matches on the *content type*, never the extension; the `type=` list on the
SPA's `accept` attribute is convenience only. Only PDF and images have a preview, so anything
else falls through `render_content` to the download button by design.

**The login credential is `User.username`, not the e-mail.** The rule lives in
`app/usernames.py` and is shared by `UserCreate` and `ensure_first_admin`, so the seeded
administrator can never be given a name the API would reject. `LoginRequest.username` is
a bare `str` rather than the validated type on purpose: a malformed login must come back
as 401 "wrong credentials", because a 422 would teach an anonymous caller the naming
rule. The e-mail column stays required — `send_password_reset` needs somewhere to
deliver, which is the whole reason the field survived the change. Migration
`b2c3d4e5f6a7` backfills existing rows from the e-mail's local part and disambiguates
collisions with a numeric suffix; it is PostgreSQL-specific, which is fine because tests
build their schema from the models on SQLite and never run migrations.

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

**The SPA** (`frontend/`) is a thin client with no business logic of its own.
Every HTTP call goes through the single transport in `src/data/http.ts` — the only
module allowed to touch the network, enforced by an ESLint `no-restricted-globals`
rule that fails the build when a component calls `fetch` outside `src/data/`.
Responses are validated at runtime by the parsers in `src/data/contracts.ts`,
because a TypeScript interface validates nothing about received JSON.

**The UI never inspects HTTP status.** It branches on `ApplicationError.category`
(`autenticacao`, `autorizacao`, `validacao`, `conflito`, `nao-encontrado`,
`indisponivel`, `rede`, `cancelado`), so protocol knowledge stays inside the data
boundary. `flattenDetail` normalises both `detail` shapes FastAPI emits and keeps
per-field errors available separately, so a 422 can highlight the offending field.

**`RemoteState` separates `loading` from `revalidating`.** First load with no data
on screen is not the same as a background refresh with data already visible, and
`empty` is its own state — a valid response with no items is not a failure. Showing
one indicator for all three is the antipattern the knowledge base names.

The dashboard reproduces the SEI process screen: an **obra plays the role of a
process**, its documents are listed in inclusion order (oldest first) on the left,
and the selected one renders beside the list. Rendering dispatches on the
`Content-Type` the download endpoint returns, never on the filename. The open obra
and document live in the URL, so the screen is shareable and a refresh restores it.
`/administracao` only renders for `administrador` — the SPA learns the role from
`GET /auth/me` because the JWT carries only `sub`/`type`/`iat`/`exp`. That page stays
reachable with zero obras on purpose: it is where the first one is created, so an
early return there would deadlock a fresh install. For the same reason the
user-management and restore-obra blocks do not depend on an obra existing. The
activate/deactivate control sits outside a `<form>` because its label follows the
selected user's state.

**Access token in memory, refresh token in `sessionStorage`.** The access token
never touches browser storage, so an XSS that reads storage does not find it; the
refresh token survives an F5 in the same tab and dies with the tab. Nothing personal
is persisted — role and identity always come from `GET /auth/me`.

**`useApiData` must not call `setState` synchronously inside an effect.** The
`eslint-plugin-react-hooks` v7 rules caught this three separate times during the
SPA build. The pattern that works is *derive, don't synchronise*: initial state is
already `loading`, the ref holding the fetch function is updated inside an effect
rather than during render, and blob URLs come from `useMemo` with the effect only
revoking them.

**The signature subsystem keeps two things separate that look like one.** A
*profile rubric* (`app/models/signature.py`) is mutable and deletable — it is
personal data, so LGPD requires it can be withdrawn, which is why it lives in its
own table even though a user is never hard-deleted. An *applied signature*
(`app/models/signature_applied.py`) stores `rubrica_object_key` pointing at an
immutable **copy** made at signing time. That copy is the whole reason deleting
your rubric cannot invalidate signatures you already made — and it is verified by
downloading the stamped PDF before and after deletion and requiring the same
SHA-256.

**The vertical flip happens exactly once, server-side.** A signature request
(`app/models/signature_request.py`) stores `x/y/largura/altura` as 0..1 fractions
with a **top-left** origin — the way the canvas measured them — plus the page size
in points, because a PDF may mix page sizes. PDF coordinates start bottom-left, so
`to_pdf_rect()` in `app/services/pdf_stamp.py` is the only place that inverts.
The SPA therefore never previews the stamp: a client-side preview would be a
second implementation of that rule, free to diverge and to lie about what gets
written. It highlights the marked area and nothing else. Stamping is on demand
(pypdf + reportlab, pure Python) and the stored object is never modified.

**Signing is gated on the password, and the rubric guard is gated on
`has_signature`.** `RotaProtegida` sends anyone without a rubric to `/rubrica`;
`ROTAS_SEM_RUBRICA` exempts that screen (or it would loop) *and* `/perfil/rubrica`,
because deleting your rubric must not eject you from the screen where you just
deleted it — the guard reasserts itself on the next protected route. Deleting also
requires the password, for a different reason than signing does: signing needs
non-repudiation, deletion is simply irreversible.

**A fetch that depends on data not yet loaded must not reject.**
`aguardandoDependencia()` in `useApiData.ts` returns a promise that never settles,
leaving the state at `loading`. Rejecting instead — which the signing screen did at
first — paints a failure that did not happen on every mount, and races the real
failure that arrives later, so which error the user saw depended on who resolved
first.

**Testing the UI has three tiers, and mixing them up is how bugs ship.** Component
tests (`*.test.tsx`) mock the data boundary and cover route, first load, empty,
error and mutation states — they need no services. Integration tests
(`src/data/*.integration.test.ts`) run the *real* boundary against a live API and
are skipped unless `GED_LIVE_API=1`. Playwright specs (`frontend/e2e/`) drive a
real browser against the whole stack. Only the last two prove anything about the
contract: writing the first tier against an invented contract is exactly how
`POST /documents` was coded as a FormData upload when the API actually takes JSON
and puts the file in a separate `/versions` call. Some things are *only*
provable in the browser — a stroke on the canvas, a PDF rendered by pdfjs, a
rectangle dragged with the mouse — so jsdom tests must not claim them.

**Visual identity lives in `frontend/src/styles/index.css` as semantic tokens**,
carried over from the Streamlit theme it replaced: one restrained accent
(`#15497b`, 7:1 on white), neutral greys, 15px base type for denser document
lists, and square corners (`--radius: 0`) — which is why `--border-width` is never
zero, since borders do the structural work corners normally would. **That is also
why there are two border tokens.** `--color-border` (1.43:1) is a decorative
divider; `--color-border-strong` (3.11:1 light / 3.46:1 dark) is what identifies a
control — field, select, textarea, the rubric canvas, the modal — because WCAG
1.4.11 requires 3:1 there and, with no rounded corners, the border is the only
thing marking where a control begins. A test enumerates every `--color-*` token
and fails if one is neither in the approved-combination list nor exempted with a
written reason, so the list cannot silently go stale. Status colours
differ in lightness as well as hue so the four document states stay distinguishable
in greyscale or to a red-green colourblind reader. No literal colour may appear
outside that file.

Related lesson recorded in `delivery-graph/demands/DEM-001/evidence/NODE-015/`:
that node's contract demanded a *manual* smoke, but the evidence filed was pytest
with the API client mocked. Mocked runs never exercise the types the API validates,
which is how a text field for a `uuid.UUID` shipped and made every upload return
422. Do not file a mocked test run as smoke evidence. The same class of error was
caught again during DEM-002 — see NODE-022 — where the SPA had been written against
an invented `POST /documents` contract and only a live-API test exposed it.

## Known limitations (from README, still true)

- **Option B (local API + Docker infra) does not work as written.** The `postgres`
  service publishes no host port, and `GED_DATABASE_URL`'s built-in default
  (`ged:ged`) does not match a generated `.env`. Needs a local compose override.
- **No test coverage measurement** (`pytest-cov` not configured).
- **The browser suite exists but is Chromium-only and started by hand.**
  `frontend/e2e/` holds two Playwright journeys (signing; refusal + rubric
  deletion) that run against `docker-compose.test.yml` — Caddy serving the built
  SPA, FastAPI, PostgreSQL, MinIO and Mailpit, nothing mocked. Bring the stack up
  yourself (`docker compose -f docker-compose.test.yml -p gede2e up -d --build`)
  and run `npx playwright test` from `frontend/`; the config has no `webServer` on
  purpose, because the target is the *built* SPA and not `vite dev`. There is one
  browser project and no CI to run any of it. The pytest suite still uses in-memory
  fakes and `scripts/smoke_*.py` remain manual.
- **`diretor` cannot administer anything.** `POST /obras`, `POST /users`,
  `PATCH /users/{id}`, `DELETE /obras/{id}` and `PUT/DELETE /obras/{obra}/users/{user}`
  are all `require_admin`, so the "Administração" tab is administrator-only. Widening
  it to Diretor means changing those authorization rules, not just the UI condition.
- **`jsdom` does not accept a programmatically set `files` list as satisfying
  `required` on `<input type="file">`.** `form.checkValidity()` returns false and the
  submit never fires, so a realistic upload interaction cannot be tested with that
  attribute present. The upload form therefore relies on a disabled button plus an
  explicit guard instead of `required` — which loses nothing, since neither depended
  on the attribute.
- **The SPA has no automatic token renewal on 401.** The refresh runs only at mount,
  so when the 15-minute access token expires mid-session the next call 401s and the
  user returns to login.
- **`AcoesDocumento` does not hide actions by status.** All buttons always render and
  the API refuses what does not apply; this is deliberate (the UI must not duplicate
  `ALLOWED_TRANSITIONS`) but it does produce clicks that always fail.
