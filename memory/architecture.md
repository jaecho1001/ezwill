# Architecture — EzWill

> Last verified: 2026-07-14 against `backend/main.py`, `backend/services/db.py`,
> `backend/routes/`, `backend/db/migrations/`, `frontend/package.json`,
> `frontend/src/app/`, and `docker-compose.yml`.

## Shape

A single Next.js app with three portals talks to a FastAPI backend over HTTP. FastAPI owns
all database access against one PostgreSQL 16 instance using the platform's `firm_{id}`
per-tenant schema model. EzWill-owned tables use the `ew_` prefix; cross-app identity links
through the shared `ix_cross_client_map` table.

## Frontend (`frontend/`, port 3000)

- **Stack:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5 + Tailwind CSS v4.
- **UI:** Radix UI primitives, Tiptap (ProseMirror) rich-text clause editor, Recharts,
  lucide-react, TanStack React Query, axios.
- **Portals (verified route dirs under `src/app/`):**
  - `/` + `/will/*` — client questionnaire: `about-you`, `your-family`, `your-estate`,
    `your-arrangements`, `poa-property`, `poa-personal-care`, `assets`, `review`, `submitted`.
  - `/dashboard/*` — lawyer dashboard: `login`, `clients`, `settings` (+ nested client detail,
    tier2, design-sheet, documents pages).
  - `/review/*` — client review portal: `review`, `review/[documentType]`, `review/complete`.
- **Data layer:** `src/lib/` (types, clause library, AI-flag rules, i18n EN/KO, API clients,
  auth, storage), `src/providers/`, `src/hooks/`, `src/components/`.
- **Tests:** Vitest (`npm run test`), sources under `src/__tests__/`.

## Backend (`backend/`, port 8003)

- **Stack:** FastAPI 0.115 + Uvicorn, psycopg2 (+ pool), Pydantic 2, python-docx,
  python-jose + passlib (auth), httpx (OpenAI + GHL calls). Dockerfile pins
  `python:3.12-slim`; source is written for Python 3.9+ compatibility.
- **Entry point:** `backend/main.py` — `FastAPI(title="EZWill API")`, CORS for localhost
  :3000/:5173, lifespan opens/closes the DB pool. Health `/`, readiness `/ready`.
- **Routers (`backend/routes/`, verified):**
  | Router | Prefix | Purpose |
  |--------|--------|---------|
  | `drafts` | `/api/drafts` | Will-draft CRUD + submit (Bearer token) |
  | `links` | `/api/links` | Client magic-link create/resolve/revoke |
  | `agents` | `/agents` | `/agents/will/invoke` — AI drafting agent (OpenAI) |
  | `clauses` | `/api/drafts` | Per-draft clause get/save/reset (Bearer token) |
  | `documents` | `/api/documents` | Generate/preview/list documents |
  | `review` | `/api/review` | Client review portal (token-based) |
  | `auth` | (own prefix) | Dashboard login + change-password |
  | `export` | `/api/export` | Assets/liabilities/estate CSV export |
- **Services (`backend/services/`, verified):**
  | Service | File | Role |
  |---------|------|------|
  | Database | `db.py` | `EWDbWriter` — tenant-aware pool + `ew_*` CRUD |
  | Document generator | `document_generator.py` | python-docx wills/POAs/affidavits |
  | PDF converter | `pdf_converter.py` | LibreOffice headless (graceful degradation) |
  | Draft service | `draft_service.py` | assembles the full draft record |
  | Link service | `link_service.py` | magic-link generation |
  | Notification service | `notification_service.py` | GoHighLevel (GHL) email + SMS |
- **AI agent:** `routes/agents.py` `/agents/will/invoke` calls **OpenAI** (`OPENAI_API_KEY`
  via httpx) with an Ontario dual-will system prompt to propose clause selections /
  quick drafts. Output is lawyer-reviewed, never auto-finalized. (Not Anthropic-backed.)
- **Notifications:** GoHighLevel Conversations API replaced SendGrid (commit `838de48`).
  Modes `ghl` / `stdout` (dev) / `disabled` via `NOTIFICATION_MODE`.

## Data model & tenancy

- **One PostgreSQL 16 database** (`caselawvision`), **per-tenant schema** `firm_{id}`.
- `services/db.py` validates schema against `^firm_[a-z0-9_]+$`, runs
  `SET search_path TO {schema}` via `psycopg2.sql.Identifier`, and uses parameterized
  queries only — matching the platform Bible's tenancy contract exactly.
- **EzWill tables (`ew_` prefix), created by migrations 25–27:**
  `ew_will_drafts`, `ew_people`, `ew_assets`, `ew_liabilities`, `ew_ai_flags`,
  `ew_client_links`, `ew_design_sheets`, `ew_trusts`, `ew_signing_events`,
  `ew_document_generations`, `ew_clause_selections`, `ew_document_configs`,
  `ew_review_approvals`, `ew_review_comments`.
- **Cross-app identity:** `ew_will_drafts` carries `ew_client_id`, `ar_client_id`,
  `lt_client_id`, and `cross_client_map_id`. Migration 25 amends the shared
  `ix_cross_client_map` table with an `ew_client_id` column + partial index (run once
  per database, not per schema).
- **Migrations** live in `backend/db/migrations/` and are numbered per the shared platform
  sequence: `25-ezwill-tables.sql` (core tables + `ix_` amendment), `26-clause-selections.sql`,
  `27-review-and-liabilities.sql`. They run against a `firm_{id}` schema (`SET search_path`
  then `\i`). Docker Compose mounts them into `/docker-entrypoint-initdb.d`.

## Integration layer (`ix_*`)

- **Implemented today:** identity linking only — the `ix_cross_client_map.ew_client_id`
  column and the cross-app id columns on `ew_will_drafts`.
- **Not yet implemented:** the `ix_sync_events` event-bus publishing (`ew.will.created`,
  `ew.poa.created`, …) that the Bible's EzWill blueprint describes. No sync-publisher or
  consumer code exists yet (only migration-25 references `ix_`). ⚠️ Treat live cross-app
  event sync as planned, not built.

## Environments

- **Local — Docker Compose** (`docker-compose.yml`): `db` (postgres:16, db `caselawvision`,
  port 5432, migrations auto-mounted), `backend` (build `./backend`, :8003,
  `DEFAULT_SCHEMA=firm_demo`), `frontend` (build `./frontend`, :3000,
  `NEXT_PUBLIC_API_URL=http://backend:8003`). No Redis in the local stack.
- **Config:** `backend/.env.example` documents `DATABASE_URL`, `DEFAULT_SCHEMA`,
  `EZWILL_PORT`, `OPENAI_API_KEY`, GHL (`GHL_API_KEY`, `GHL_LOCATION_ID`),
  `NOTIFICATION_MODE`, firm identity vars, and dashboard auth
  (`DASHBOARD_PASSWORD`, `SECRET_KEY`). `.env` files are git-ignored.
- **Production (planned):** Vercel (frontend) + Supabase (Postgres) for Ontario testing —
  issue #65; the FastAPI host is still TBD. Secrets management, HTTPS/TLS, backups, and
  real per-lawyer SSO/JWT are tracked in issues #57, #54, #56, #52.

## External services

OpenAI API (will-drafting agent / quick draft), GoHighLevel (unified email + SMS),
LibreOffice headless (DOCX→PDF, optional). PostgreSQL 16 is the durable system of record.

## Tests

- **Backend (pytest, `backend/tests/`):** ~129 test functions — `test_models.py` (35),
  `test_routes.py` (29), `test_quick_draft.py` (36), `test_document_generation_e2e.py` (15),
  `test_notification_service.py` (14), plus `test_docgen_e2e.py` (script-style DOCX checks).
- **Frontend (Vitest):** clause-library integrity, will-document index helpers, AI-flag
  engine, and bilingual i18n coverage (see `README.md`).
- README quotes an aggregate "155+" spanning both suites; treat the per-file counts above
  as the verified backend figures.
