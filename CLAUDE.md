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
# Dev server on :5173. It is a different origin from the API, so the API must name
# it in GED_CORS_ORIGINS or every request dies at the preflight:
VITE_API_BASE_URL=http://localhost:8080/api npm --prefix frontend run dev
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

`.github/workflows/deploy.yml` runs `pytest`, `ruff check .`, and the frontend
lint/typecheck/test/build on every push to `main` and on every pull request (a
feature branch with no open PR gets no CI); still run them locally before
committing — CI is the backstop, not the first check.

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
`ObraRead` (`app/schemas/obra.py`) emits `is_deleted`, and the SPA's restore block
(`frontend/src/features/admin/AdminPage.tsx`) filters on it — so archiving there must
reload *both* the active and the archived lists, or "Restaurar" never appears.

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

**CORS is off unless someone names an origin.** In production Caddy serves the SPA
and the API from one origin, so there is no cross-origin call to authorize and
`GED_CORS_ORIGINS` stays empty. The Vite dev server is the exception — it runs on
another port, and without naming it there the browser blocks every request at the
preflight and the login screen reports a network failure. That is not a
hypothetical: the documented `npm run dev` workflow was unusable until this
existed. The value is a comma-separated list, trimmed, and an empty entry never
becomes an origin (which would match a `null` Origin header).

**Config** (`app/config.py`) reads everything from env vars prefixed `GED_`
(see `.env.example`); nothing is hardcoded, enforced by
`scripts/check_no_hardcoded_secrets.py`, which scans `docker-compose.yml` *and*
`scripts/` — the host-side scripts run against a live deployment, so a credential
baked into one of them authenticates against nothing. **`services.api.environment` in `docker-compose.yml` is a whitelist** — there is no
`env_file:`, so a setting present in the server's `.env` but not named there silently
keeps its code default inside the container. SMTP shipped that way: production would
have logged reset tokens instead of e-mailing them, with no error.
`tests/test_compose_api_env.py` resolves the compose interpolation into the real
`Settings` and fails when a field is neither passed through nor exempted with a
reason. Defaults there must parse (`${GED_SMTP_PORT:-587}`, not an empty `:-`), or an install
without e-mail crashes at startup. `GED_MINIO_ACCESS_KEY` /
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

**The server only ever pulls; it never builds — two independent reasons why.**
`docker-compose.prod.yml` overrides `api`/`web` with pre-built `ghcr.io/...` images,
but merging it with `docker-compose.yml` does not remove that file's `build:` key —
Compose keeps both, and only skips the build step because the `deploy` job's remote
command never passes `--build` (`tests/test_deploy_pipeline.py::test_deploy_command_never_rebuilds_on_the_server`
is what enforces this). Second, independent guard: `/opt/ged` on the server only ever
holds the two compose files plus `docker/Caddyfile` (see README) — no `Dockerfile`, no
`app/`, no `frontend/` — so even a `--build` run by hand there fails loudly (missing
Dockerfile) instead of silently building stale code. `scripts/check_no_hardcoded_secrets.py`
scans `docker-compose.yml`, `docker-compose.prod.yml` *and* `docker-compose.backup.yml`,
but deliberately skips `docker-compose.test.yml` — that file's credentials are throwaway
and documented in its own header. The deploy script includes `docker-compose.backup.yml`
in its `-f` flags only when that file is present on the server (i.e. only if the optional
backup overlay was opted into) — otherwise `--remove-orphans` would kill the long-running
`backup` container every deploy, since it isn't declared in the deploy's own file set.

**In production only Caddy (`web`) publishes host ports.** `docker-compose.yml` publishes
`api` 8000 and `minio` 9000/9001 for local dev, and Compose *appends* `ports` across `-f`
files, so `docker-compose.prod.yml` can only remove them with `ports: !reset []`,
which needs Compose 2.24.4 or newer on the server. Left published, api:8000 accepted
logins over plain HTTP around Caddy's TLS and 9001 served the MinIO console behind root credentials — and a host
firewall does not help, because Docker DNATs published ports before the INPUT chain.
Caddy→api and api→minio use the compose network. `tests/test_deploy_pipeline.py` parses
compose with a `SafeLoader` subclass that knows `!reset` (`yaml.safe_load` rejects the tag),
and `test_production_publishes_host_ports_only_through_caddy` takes the file list from the
deploy job's `-f` flags, emulates the merge, and counts `network_mode: host` as exposure.
The deploy job never refreshes the compose files in `/opt/ged`, so a change to them must be
copied to the server by hand. A Compose without `!reset` support may silently ignore the tag and keep
the ports published, so the README's provisioning step checks `docker ps` after the first up;
the server's `.env` sets `COMPOSE_FILE` so manual `docker compose` commands there use the
same file set as the deploy instead of re-publishing the dev ports.

**The SPA** (`frontend/`) is a thin client with no business logic of its own.
Every HTTP call goes through the single transport in `src/data/http.ts` — the only
module allowed to touch the network, enforced by an ESLint `no-restricted-globals`
rule that fails the build when a component calls `fetch` outside `src/data/`.
Responses are validated at runtime by the parsers in `src/data/contracts.ts`,
because a TypeScript interface validates nothing about received JSON.
Use the strict field helpers there (`texto`, `booleano`, ...): a parser that
*defaults* a missing field hides a field the backend never sends. `parseObra` once
defaulted `is_deleted` to `false` while `ObraRead` did not emit it, so the archived-obras
list was silently always empty. The lenient defaults that remain (`has_signature`,
`token_type`) are for fields the backend always emits.

**The UI never inspects HTTP status.** It branches on `ApplicationError.category`
(`autenticacao`, `autorizacao`, `validacao`, `conflito`, `nao-encontrado`,
`indisponivel`, `rede`, `cancelado`), so protocol knowledge stays inside the data
boundary. `flattenDetail` normalises both `detail` shapes FastAPI emits and keeps
per-field errors available separately, so a 422 can highlight the offending field.

**`RemoteState` separates `loading` from `revalidating`.** First load with no data
on screen is not the same as a background refresh with data already visible, and
`empty` is its own state — a valid response with no items is not a failure. Showing
one indicator for all three is the antipattern the knowledge base names.

`ObraShell` (`frontend/src/features/obras/ObraShell.tsx`) reproduces the SEI process
screen: an **obra plays the role of a process**, its documents are listed in
inclusion order (oldest first) on the left, and the selected one renders beside the
list. Rendering dispatches on the `Content-Type` the download endpoint returns,
never on the filename. PDFs are drawn by pdfjs, never by
`<object type="application/pdf">` — that element delegates to a browser plugin, and
where there is none it silently falls back and shows nothing. The open obra
and document live in the URL, so the screen is shareable and a refresh restores it.
It is reached by clicking a card on the home dashboard (below), not by landing
there directly. `/administracao` only renders for `administrador` — the SPA learns the role from
`GET /auth/me` because the JWT carries only `sub`/`type`/`iat`/`exp`. That page stays
reachable with zero obras on purpose: it is where the first one is created, so an
early return there would deadlock a fresh install. For the same reason the
user-management and restore-obra blocks do not depend on an obra existing. The
activate/deactivate control sits outside a `<form>` because its label follows the
selected user's state.

**`/` is a dashboard, not a redirect.** `GET /obras/summary` (`app/api/obras.py`)
is registered *before* `GET /{obra_id}` — reversing the order would make FastAPI
try to parse "summary" as a UUID and 422 before the handler ever runs. For each
obra `scope_obra_query` grants the caller, it returns document counts by status
plus the single most recent document-lifecycle audit event, computed as one grouped
`COUNT` query and one `ROW_NUMBER() OVER (PARTITION BY obra_id ORDER BY
created_at DESC)` window query — a single round trip regardless of document count,
instead of N+1 per-obra queries or shipping every audit row for client-side
aggregation. `download` and `login` are excluded from "latest activity"
(`ACTIVITY_EXCLUDED_ACTIONS`): viewing a document is not an update, and a login
has no document to attribute it to. Results sort by latest-activity descending
(obras with no activity sort last) and are capped at `MAX_SUMMARY_OBRAS = 10` — a
defensive cap, not pagination, since production is confirmed to never exceed 10
obras. The frontend's `frontend/src/features/obras/EscolherObra.tsx`, which used to
auto-redirect to the caller's first obra (or show a bare "no obras yet" message),
is deleted; `frontend/src/features/dashboard/DashboardPage.tsx` is the new `/`
route in `frontend/src/App.tsx` and renders `<MinhasPendencias />` (cross-obra
"awaiting my signature") above a card grid built from `resumoObras()` /
`ResumoObra` in `frontend/src/data/api.ts` / `contracts.ts` — each card's `StatusBadge`
(`frontend/src/components/ui/StatusBadge.tsx`) reuses the *already-approved*
`--color-success`/`--color-warning`/`--color-danger` tokens rather than adding new
ones, so it needed no changes to the `--color-*` coverage test described below, and
it is deliberately symbol-plus-text rather than a colored-background pill (WCAG
1.4.1: color reinforces, it doesn't carry the meaning alone). Clicking a card
navigates to `/obras/:id`, i.e. `ObraShell` above. `frontend/src/components/layout/Cabecalho.tsx`
is pulled out of what used to be markup inlined in `ObraShell`'s header — brand
name, user identity, "Minha rubrica"/"Administração" links, "Sair" — so
"Gerenciador de Documentos" exists in one place instead of duplicated across every
screen that needs it; it takes `children` so `ObraShell` can still inject its obra
`<select>` while the dashboard renders it with none.

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

**Visual identity lives in `frontend/src/styles/index.css` as semantic tokens.**
A "friendlier UI" redesign moved it from the original Streamlit-derived look
(one restrained accent at 7:1, square corners) to: a more vivid, saturated accent
(`#1a56db` light / `#4c8dff` dark, both ≥6:1 — still comfortably above the 4.5:1
WCAG AA floor, just trading some of the old extra margin for saturation) and a
**graduated radius scale** — `--radius-sm` (buttons, inputs),
`--radius-md` (cards), `--radius-lg` (the modal) — instead of one flat value,
because a single large radius applied to a small control looks wrong next to the
same radius on a big container. `--radius: 0` stays defined but consumed nowhere,
kept only so nothing that might reference it breaks silently. Status colours and
the neutral grey scale were deliberately left alone — the redesign's brief was
"one more vivid accent," not a full palette rework. `--border-width` is still
never zero: rounding corners didn't remove the need for a control's boundary to
be visible, it just softened its shape. **That is also why there are two border
tokens.** `--color-border` (1.43:1) is a decorative divider; `--color-border-strong`
(3.11:1 light / 3.46:1 dark) is what identifies a control — field, select,
textarea, the rubric canvas, the modal — because WCAG 1.4.11 requires 3:1 there.
A filled `Button` (`frontend/src/components/ui/Button.tsx`, `variant="primary"`)
is the one exception that needs no border of its own: its solid fill against the
page background already clears 3:1, which is why only the unfilled `secondary`
variant carries `--color-border-strong`. `Card` (`components/ui/Card.tsx`) uses a
soft `--shadow-card` instead of a border, because a card is a container, not a
"control" under 1.4.11. A test enumerates every `--color-*` token and fails if one
is neither in the approved-combination list nor exempted with a written reason, so
the list cannot silently go stale — and a second, narrower test does the same for
the dark-mode accent and focus ring, not a full duplicate of the light-mode table.
**Dark mode has two token blocks that must stay identical**: `@media
(prefers-color-scheme: dark)` (system preference) and `:root[data-theme="dark"]`
(an explicit override, for if a manual toggle is ever wired up) — nothing enforces
this beyond both being written by hand, which is exactly how a `replace_all` edit
during the redesign silently updated only the first one, matched by indentation
rather than by which selector it was under. The dark-mode contrast test reads the
explicit-override block specifically, so a future edit that repeats this mistake
will fail it. Status colours differ in lightness as well as hue so the four
document states stay distinguishable in greyscale or to a red-green colourblind
reader. No literal colour may appear outside that file.

**For a viewer, the honest assertion is about what was drawn.** `VisualizadorPdf`
looked up `canvas[data-pagina=N]` *while the state was still `carregando`* — the
moment when the component renders only the loading paragraph and no canvas is
mounted. `containerRef.current` was null, `render()` was never called, and every
PDF in the app was a blank rectangle. Nothing caught it: the component tests
stubbed `render` without ever asserting it ran, and the E2E waited for the
*marking layer*, which exists whether or not the page was painted. Loading is now
two phases — measure the pages, let the canvases mount, then draw the visible one
— and the canvas carries `width`/`height` from the measured page so the marking
layer never changes geometry under the pointer. `frontend/e2e/leitura-de-pdf.spec.ts`
counts opaque, dark pixels; note that a *transparent* pixel reads as black, so
counting "non-white" without checking alpha reports a blank canvas as fully inked.

**Rendering only the active page is deliberate**, not an optimisation detail: a
hundred-page PDF must not cost a hundred renders to show page one. Switching pages
cancels the in-flight render task, because two concurrent renders on one canvas is
an error in pdfjs.

**A feature can be fully tested part by part and still not exist.** Password reset
shipped with an API endpoint, a passing endpoint test, a `resetPassword` function in
the data boundary, and an e-mail carrying the right link — and no `/redefinir-senha`
route, so the link landed on "page not found". Every piece had a test; the seam
between them had none, and no test asks "is this function called by anything?".
`frontend/e2e/recuperacao-de-senha.spec.ts` now walks it in a browser and asserts the
part that actually matters: the new password logs in and the old one stops working.
When wiring a boundary function, check that a screen calls it.

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
  Running only the *SPA* locally against the containerised API does work, and is the
  easier path: `docker-compose.test.yml` already sets `GED_CORS_ORIGINS` for :5173.
- **No test coverage measurement** (`pytest-cov` not configured).
- **The browser suite exists but is Chromium-only and started by hand.**
  `frontend/e2e/` holds four Playwright journeys (signing; refusal + rubric
  deletion; password recovery; PDF actually drawn on screen) that run against `docker-compose.test.yml` — Caddy serving the built
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
