# Status — where we left off

> Last updated: 2026-07-27.

- **This session:** reviewed the production-readiness audit in issues #83–#95 and
  implemented the first containment tranche in source commits `35f4018` and `9b57b67`:
  1. #89: removed the collection-time psycopg2 mock, narrowed real-DB skip conditions to
     actual connection failures, and made CI run the complete backend suite with the real
     driver and migrated database;
  2. #83 interim control: will generation, batch generation, and preview now identify a
     semantic instruction gap when selected residue clauses omit the named beneficiaries
     or percentage shares in the client vault. Delivery returns 422 unless a lawyer uses
     the existing recorded `allow_incomplete` override;
  3. #85 immediate controls: corrected Ontario POA instructions from one witness to two in
     English and Korean; stopped end-of-life and organ-donation clauses from being selected
     by default; and blocked those clauses unless the matching client instruction is
     affirmative;
  4. #94: removed fabricated client quotes, performance/savings figures, completion-time
     claims, “most popular” claims, and the unsupported pay-at-download promise from the
     public page. Replaced them with factual descriptions of intake scope and draft status.
  5. Follow-up review found the residue rule covered only the canonical vault while public
     starts still use the legacy questionnaire. The shared instruction guard now reads both
     models and stored beneficiary rows, binds each percentage to the correct name, and
     blocks mismatched client preview/approval as well as generation;
  6. the unified intake now asks an explicit life-support question; previously saved
     sensitive POA clauses open deselected unless an affirmative client answer supports
     them; and the remaining timing/checkout/support commitments were removed.
- **Verified:** backend 293 passed / 2 real-DB tests skipped when no database was running;
  backend 295 passed against a newly migrated temporary PostgreSQL 16 database; frontend
  95 passed across 11 files; TypeScript and Next.js production build clean;
  `git diff --check` clean. The temporary database container and synthetic data were
  removed after the test. Draft PR #97's GitHub run `30287903274` is green across backend
  migrations/pytest, clean-install frontend typecheck/tests/build, and Compose image builds.
  The earlier frontend CI failure exposed an undeclared `jsdom` test dependency; commit
  `36f745a` declares and locks it.
- **Important context:** this working copy (`ezwill-main` on Desktop) began as a ZIP
  snapshot and its local history has no merge base with `origin/main`; direct push to main
  would be rejected and force-push is forbidden. The top of stacked PR #74 has the exact
  same file tree as local `e09bcc7`, so commits after that point can be replayed safely onto
  a new branch based on `origin/feat/self-serve-intake-to-firm`. The eight source/brain
  commits were replayed without conflicts and published as draft PR #97 on
  `agent/audit-safety-followup`, stacked on #74.
- **Previously completed launch safeguards:** unresolved-placeholder refusal with logged
  lawyer override; durable generated-document bytes and SHA-256; payment gate; vault sync;
  send-to-lawyer; deterministic generation ordering; adversarial review fixes. See commits
  `1c5e0ef` through `ed5e19f`.
- **Still open from the audit:** #83 needs lawyer-approved named-share, equal-share, and
  gift-over residue drafting plus real repeating-block rendering; #85 needs a lawyer review
  of consolidated execution copy (the unified-intake life-support choice is now wired).
  #86 still needs an enforced, attributable lawyer approval state before client delivery.
  Privacy/consent (#90), Korean legal-document posture (#93), and the remaining security,
  concurrency, notification, and placeholder work remain launch gates under #95. PR #97
  now carries the complete intake context (answers, people, assets, and flags) into the
  lawyer workspace for #87.
- **Known issue #75 follow-up:** the public self-serve CTA still enters the
  legacy `/will/*` flow; only lawyer-created magic links are switched. Legacy questionnaire
  rows are now protected from autosave deletion, but are not backfilled into the new vault.
  Cross-device conflict resolution has no timestamps yet. The bearer magic link still
  exposes the draft to anyone it is forwarded to and needs a deliberate expiry/step-up-auth
  decision. The legacy `WillDocument` remains during migration. Form/chat reuse of a
  previously entered person is not built. The new summary page is English-only and needs
  full EN/KO parity. Multiple-gift clause projection and the dual-will lawyer workflow need
  explicit coverage. Real-user accessibility/usability testing and a real-Postgres
  cross-device walk remain.
- **Next step:** review and merge green draft PR #97, then implement recorded lawyer
  approval (#86). In parallel, obtain lawyer-approved residue and POA wording for the
  engineering work that remains in #83/#85.
- **Guardrail:** unchanged — legal output draft-only and lawyer-approved; tenant isolation
  intact; no secrets/PII committed.
