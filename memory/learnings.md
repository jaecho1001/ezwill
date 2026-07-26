# Learnings — self-improvement journal

> Last updated: 2026-07-26.

Append-only. One dated bullet per lesson: what happened, what you learned, and (if it
became a rule) where you wrote it down.

- 2026-07-14 — Bootstrapped the agent brain for EzWill as an additive documentation layer;
  no source code changed. Verified every asserted fact against `backend/`, migrations,
  `frontend/package.json`, and route dirs before writing it. → *(rules in `conventions.md`)*
- 2026-07-14 — The `caselawvision-platform` Bible's EzWill blueprint (`docs/apps/EZWILL.md`)
  is stale: it lists Status "Planned" and Stack "TBD", but the repo is substantially built
  (Next.js 16 + FastAPI, three portals, migrations 25–27, ~129 backend tests). Lesson:
  verify app reality from the app repo, not the Bible's planning entry. Flagged for a Bible
  update in `status.md`.
- 2026-07-14 — The `ix_*` integration is only partly realized: the identity column
  (`ix_cross_client_map.ew_client_id`) exists, but the `ix_sync_events` event bus the Bible
  describes is not implemented. Marked as planned, not built, rather than asserting live
  cross-app sync. → *(Open questions in `AGENTS.md`; gotcha in `conventions.md`)*
- 2026-07-14 — Notifications moved from SendGrid to GoHighLevel (commit `838de48`), so the
  README's "Notification Service | SendGrid" row is stale. Recorded the current provider and
  flagged the doc drift. → *(gotcha in `conventions.md`, decision in `decisions.md`)*
- 2026-07-19 — The repo's own audit documents were stale in BOTH directions: the
  2026-07-11 AUDIT_UPDATE's top security P0s (session-secret fallback, unauthenticated
  change-password, committed compose secrets) were already fixed in this tree, AND a
  "missing" feature (public self-serve draft creation, `POST /api/drafts/self-serve`)
  already existed — my own readiness grep missed it because I searched for
  `def create_draft|create_public` instead of reading the router. Lesson: an audit is a
  hypothesis list, not a findings list; re-verify every claim against the current tree
  before repeating it, and grep for ROUTES (`@router.`) not guessed function names.
- 2026-07-19 — A real-Postgres integration test caught what every mocked test passed:
  rows inserted in one transaction share `now()` (transaction timestamp), so
  `ORDER BY created_at DESC` was nondeterministic for generate-all batches. Fixed with
  `clock_timestamp()` at insert + `id` tiebreaker. Reinforces the standing rule:
  real-DB tests are mandatory for SQL changes. → *(gotcha in `conventions.md`)*
- 2026-07-19 — `tests/test_routes.py` replaces `sys.modules['docx']` (and psycopg2 etc.)
  with MagicMocks at collection time. Any test importing docx at RUNTIME (inside a test
  body) gets the mock and fails only in the full-suite run. Convention: bind real
  modules at module level in test files that sort alphabetically before `test_routes`.
  → *(gotcha in `conventions.md`)*
- 2026-07-19 — Migration numbering: the next free number was 37, not 28 — AGENTS.md's
  "migrations 25→26→27" table was stale (13 migration files exist: 00 + 25–38 now).
  Lesson: derive migration numbers from `ls backend/db/migrations/`, never from docs.
  → *(AGENTS.md key-commands row corrected)*
- 2026-07-26 — A polished intake is not complete merely because it reaches a summary:
  the newer six-section vault omitted several document-driving facts, and the lawyer
  dashboard read only legacy questionnaire columns. The client-to-lawyer contract must
  be tested end-to-end: question → versioned fact → server resume → lawyer visibility →
  placeholder/flag. Added schema migration, dashboard projection, and coverage tests.
