# Conventions, standing rules, and gotchas

> Last verified: 2026-07-19. Add a rule when a verified mistake teaches one.

## Tenancy & data (from the platform Bible, enforced in code)

- **Scope every query by `firm_{id}` schema.** Validate `^firm_[a-z0-9_]+$`,
  `SET search_path TO {schema}` before queries, `psycopg2.sql.Identifier()` for quoting,
  parameterized SQL only — the `EWDbWriter` context manager in `services/db.py` does this;
  route new DB access through it, never string-interpolate SQL.
- **Never trust a client-supplied schema/tenant id.** Resolve tenancy server-side.
- **Own only `ew_` tables.** Never write another app's prefixed tables. Touch shared
  `ix_*` tables only through the documented integration contract (identity map today).
- **Migrations are numbered in the shared platform sequence** (EzWill's are `00` + `25–38`
  as of 2026-07-19; derive the next number from `ls backend/db/migrations/`, never from
  docs) and run against a `firm_{id}` schema via `scripts/run_migrations.py`. The
  `ix_cross_client_map` amendment in migration 25 is a once-per-database step, not
  once-per-schema — keep it idempotent (`IF NOT EXISTS`).
- **New migration files MUST contain the exact literal line `SET search_path TO firm_demo;`**
  — the runner string-replaces that precise text to retarget tenant schemas; a stylistic
  variant silently lands DDL in the wrong schema. **Never edit an applied migration**: the
  runner records SHA-256 checksums and aborts on mismatch. Idempotent DDL only.

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

- **Backend:** `cd backend && python -m pytest` (271 passing as of 2026-07-19 across
  models, routes, guards, DOCX generation, persistence, payments, notifications).
- **Frontend:** `cd frontend && npm run test` (Vitest, 80 passing) + `npm run typecheck`.
- **Real-DB tests are mandatory for SQL/migration changes** (mocked cursors pass reversed
  COALESCE, bytea, and ordering bugs straight through). Pattern:
  `tests/test_*_realdb.py`, self-isolating, skip without a DB; CI runs them in a separate
  process against a migrated `firm_ci` schema (see `.github/workflows/ci.yml`).
- CI: issue #55 (CI pipeline — tests + typecheck + build on every PR) is closed; keep new
  work green under it.

## Gotchas (verified from code / issues)

- **Notifications are GoHighLevel, not SendGrid** (commit `838de48`). Any doc that says
  "SendGrid" is stale. Modes: `ghl` / `stdout` / `disabled`. Issue #44 wants GHL scoped to
  appointments only (no review link via GHL) — not yet reconciled.
- **Dashboard auth (verified 2026-07-19):** HMAC-signed session in an HttpOnly cookie;
  `AUTH_SESSION_SECRET` is required (server fails closed without it) and compose has no
  committed secret defaults (`${VAR:?}`). Older docs describing a `vaturi2026` default and
  in-memory-only tokens are stale. Still single-account: real per-lawyer SSO/JWT remains
  issue #52.
- **`tests/test_routes.py` replaces `sys.modules['docx']`/psycopg2 with MagicMocks at
  collection time.** A test that imports docx at runtime (inside a test body) gets the
  mock and fails only in full-suite runs. Bind real modules at module level, in test files
  that sort alphabetically before `test_routes`.
- **Rows inserted in one transaction share `now()`** (transaction timestamp) — never rely
  on `created_at` alone to order batch inserts; use `clock_timestamp()` at insert and/or a
  deterministic tiebreaker (caught by the real-DB persistence test, 2026-07-19).
- **Payment gate (2026-07-19):** `ew_will_drafts.origin` (`lawyer` default / `self_serve`)
  decides who must pay before document delivery under `PAYMENT_ENFORCEMENT=self_serve`;
  `refunded` counts as unpaid; overrides are per-request (`override_payment=true`) and
  logged. Don't add delivery paths that skip `services/payment_gate.py`.
- **`ix_` event-bus sync is not implemented** — only the identity-map column exists.
  Don't document live cross-app event publishing as built.
- **Dockerfile pins Python 3.12 but code targets 3.9+** (commit `349a8ca` added
  `from __future__ import annotations`). Keep new code 3.9-compatible unless the floor is
  formally raised.
- **Run `uvicorn` from inside `backend/`** — imports (`from services…`, `from routes…`)
  resolve relative to that directory, not the repo root.
