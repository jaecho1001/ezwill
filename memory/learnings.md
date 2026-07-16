# Learnings — self-improvement journal

> Last updated: 2026-07-14.

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
