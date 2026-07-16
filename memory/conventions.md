# Conventions, standing rules, and gotchas

> Last verified: 2026-07-14. Add a rule when a verified mistake teaches one.

## Tenancy & data (from the platform Bible, enforced in code)

- **Scope every query by `firm_{id}` schema.** Validate `^firm_[a-z0-9_]+$`,
  `SET search_path TO {schema}` before queries, `psycopg2.sql.Identifier()` for quoting,
  parameterized SQL only — the `EWDbWriter` context manager in `services/db.py` does this;
  route new DB access through it, never string-interpolate SQL.
- **Never trust a client-supplied schema/tenant id.** Resolve tenancy server-side.
- **Own only `ew_` tables.** Never write another app's prefixed tables. Touch shared
  `ix_*` tables only through the documented integration contract (identity map today).
- **Migrations are numbered in the shared platform sequence** (EzWill's are 25–27) and run
  against a `firm_{id}` schema. The `ix_cross_client_map` amendment in migration 25 is a
  once-per-database step, not once-per-schema — keep it idempotent (`IF NOT EXISTS`).

## Legal / compliance

- **All generated documents are draft-only and lawyer-approved.** The AI drafts wills,
  POAs, and clause selections; a lawyer reviews and approves. Never present output as final
  or filed, and never bypass the review step.
- **Ontario correctness matters.** Clause text and AI flags track Ontario statutes/case law;
  changes to the clause library or flagging rules are legal-review-worthy, not just code.

## Brain / workflow rules

- **Work directly on `main`; never force-push `main`.** PR the first brain change.
- **Keep brain commits separate** from source changes: `chore(brain): <what changed>`.
- **Verify before you assert.** Cite the file a fact came from; mark guesses `⚠️ ASSUMPTION`
  and collect them in `AGENTS.md` → Open Questions.
- **Never overwrite existing docs/brain files blindly** — read and merge.
- **Explain every git action in plain English** a non-engineer (a lawyer) can follow — in
  the reply and mirrored in the commit body ("Legible changes" in `NORTH-STAR.md`).
- **Never commit secrets, tokens, cookies, or client/PII.** Names and boolean status only.
  `.env` and `backend/.env` stay git-ignored.
- **Dates `YYYY-MM-DD`; no emoji in new docs.**
- **Update `memory/status.md`** after substantive work.

## Testing expectations

- **Backend:** `cd backend && python -m pytest` (pytest; ~129 test functions across models,
  routes, quick-draft agent logic, DOCX generation, and notifications).
- **Frontend:** `cd frontend && npm run test` (Vitest; clause library, document helpers,
  AI-flag engine, i18n coverage).
- CI: issue #55 (CI pipeline — tests + typecheck + build on every PR) is closed; keep new
  work green under it.

## Gotchas (verified from code / issues)

- **Notifications are GoHighLevel, not SendGrid** (commit `838de48`). Any doc that says
  "SendGrid" is stale. Modes: `ghl` / `stdout` / `disabled`. Issue #44 wants GHL scoped to
  appointments only (no review link via GHL) — not yet reconciled.
- **Dashboard auth is a shared password + in-memory Bearer tokens** (`DASHBOARD_PASSWORD`,
  default `vaturi2026` in `docker-compose.yml`/`.env.example`). Tokens don't survive a
  restart; real per-lawyer SSO/JWT is issue #52 and secrets removal is issue #57. Do not
  treat the default password as production-safe.
- **`ix_` event-bus sync is not implemented** — only the identity-map column exists.
  Don't document live cross-app event publishing as built.
- **Dockerfile pins Python 3.12 but code targets 3.9+** (commit `349a8ca` added
  `from __future__ import annotations`). Keep new code 3.9-compatible unless the floor is
  formally raised.
- **Run `uvicorn` from inside `backend/`** — imports (`from services…`, `from routes…`)
  resolve relative to that directory, not the repo root.
