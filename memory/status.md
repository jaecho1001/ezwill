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

## 2026-07-27 (later) — remaining engineering backlog closed on PR #97

- Commits `21d013a`..`b29a679` (CI green): #78 legacy backfill (resolve-time
  projection, lawyer-note carryover), #86 recorded lawyer approval gating the
  review portal + link creation (migration 40; regeneration clears approval),
  #79 engineering defaults (not-applicable vs complete, validate-on-next,
  spouse required, unnamed shares rejected), #88 honest delivery status +
  startup guard, #84 signing-record capture + derived dual-will titles +
  data-conditional clause defaults + dashboard override button, #87 end-to-end
  journey test (real Postgres, real API, 21 assertions).
- The journey test caught a real bug first run: update_document_generated was
  an UPDATE against a config row most drafts never have — zero rows matched,
  approval impossible on the default path. Now an upsert.
- Gotcha recorded: TestClient(main.app) lifespan shutdown closes the shared
  pool; test fixtures must reset services.db._pool to None afterwards.
- Backend 333 passed / 0 skipped vs migrated PG16 (migrations 00 + 25-40);
  frontend 110 tests + typecheck + build. What remains is decisions, not
  code — see issue #95's decision table (owner: self-serve/checkout, email
  provider, approval workflow; lawyer: residue drafting, POA wording, Korean
  translation, hasDualWill, display thresholds).

## 2026-07-28 — second adversarial review round closed (commit 27b9a16)

- Codex's review of PR #97 found 9 defect groups; ALL verified real against
  code before fixing. Highest severity: clause edits did not revoke lawyer
  approval while the client portal renders LIVE clauses (approve A, edit to
  B, B ships under A's approval). save_clause_selections now revokes;
  journey test walks the bypass sequence.
- Own-goal recorded honestly: the 위임자→대리인 fix broke nine Korean
  particles (대리인를/는/가 → 대리인을/은/이). Particle agreement follows the
  final consonant of the replaced noun — blanket noun replacement in Korean
  is never safe without a particle pass.
- Guard: prefix-name fail-open (Ann satisfied by 'Ann Park') closed; review
  portal now scans clause text for bracket literals + malformed {{tokens}}.
- #87 truly complete now (payload carries assets/ai_flags/review_comments/
  approvals; tier2 hydrates vault from server; comments panel). Lesson: my
  own journey test asserted a SUBSET of the claimed payload — an E2E test
  only protects what it actually asserts.
- #84: FIVE raw buildDefaultSelections callers (review found one) all now
  filtered. #78: liability-only detection, deterministic uuid5 ids, address
  composition. #88: review links get honest delivery status; runbook env
  list fixed. #79: totals in every mode; stepper gated like Next.
- Backend 341 passed / 0 skipped vs real PG16; frontend 110; CI green.
- Remaining open scope on PR: generation-hash approval binding, clause
  whitelist, per-lawyer identity (#52), delivery persistence/resend,
  commissioner capture flow — plus the standing owner/lawyer decisions.

## 2026-07-28 (later) — pilot-readiness round shipped (PR #97 @ 392cc91)

- #98 follow-up Q&A complete both sides (backend d153401, UI 392cc91 via
  worktree agent — its Korean particle grammar verified correct this time).
  Required questions block approval; answering alone does not unblock.
- #86 follow-up: approval binds generation id + SHA-256 (migration 42).
- #90 engineering: bilingual AI-consent gate, recorded with notice version,
  server-side 403; token/email/phone redaction in all dev notification logs.
  Policy TEXT remains the lawyer's.
- #88 engineering complete: delivery attempts persisted (migration 43),
  resend reuses the active token. Provider/domain still the owner's call.
- Backend 344/0-skips vs real PG16; frontend 122; CI green.
- Next engineering after decisions: #52 per-lawyer identity, then deploy
  config for whichever host is chosen. Everything else on the Phase-1
  checklist is lawyer drafting, owner decisions, or browser walkthroughs.

## 2026-07-28 (evening) — #52 + #65 shipped; engineering side of MVP complete

- #52: ew_lawyers (migration 44), email login, actor claim in signed session,
  approved_by/generated_by/asked_by carry real names (real-DB proven),
  Settings account management, shared password = bootstrap admin w/ warning.
- #65: backend/fly.toml (yyz, /ready check, migrations as release_command),
  frontend/vercel.json, runbook §3 rewritten w/ bootstrap step.
- Backend 346/0-skips; frontend 122; CI green at de43c95.
- Dashboard inventory for MVP: built = client list, client file (answers/
  assets/flags/comments/questions/delivery), Will Editor (server-hydrated),
  documents (generate/approve/override), review links, settings (firm/
  witnesses/lawyers), usage. Gap = a home/pipeline overview (drafts by
  status + open questions across clients). Everything else blocking launch
  is decisions: provider+domain, hosting accounts, lawyer drafting
  (#83/#85/#90 policy), self-serve on/off (#81/#96).

## 2026-07-28 (night) — pipeline overview shipped + review-hardened (df0b80d)

- Dashboard home now opens on four action queues (awaiting review / open
  questions / generated-unreleased / delivery problems), each linking into
  the file, with TRUE totals and 'showing 5 of N'.
- Its own review round confirmed 3 majors, all fixed + real-DB tested:
  fully-handled files leave the review queue (status lifecycle gap:
  nothing moves drafts past 'submitted' before signing — pre-existing,
  noted); remediated deliveries leave the problems board (record_delivery
  needed clock_timestamp — same lesson as the generations trail, THIRD
  occurrence: any same-transaction ordering needs it); ISO timestamps;
  visible fetch errors.
- Backend 347/0-skips, frontend 122, CI green.

## 2026-07-28 (late) — Codex overview review: both findings fixed (77f4b93)

- Finding 1 (real): 'fully handled' judged only GENERATED docs — a file with
  an approved will but a requested-never-generated POA vanished from every
  queue. Fix: required_document_groups() in services/db.py mirrors the
  frontend determineRequiredDocuments rule; queue exit requires every
  required doc generated AND approved. Real-DB test pins the vanishing case
  (file must REMAIN) and the truly-finished case (must leave).
- Finding 2 (real): headline cards counted the 50-row list. Now read the
  uncapped status_counts (lib/dashboard-stats.ts, unit-pinned at 170).
- Accepted framing correction: say 'pushed to draft PR, CI green' — never
  'shipped' as if merged/deployed. Deploy execution = #100; lifecycle = #99.
- Backend 348/0-skips, frontend 124, CI green.

## 2026-07-28 (latest) — Codex round 3: consistency fixes (9ff80f9)

- Round-3 review confirmed rounds 1-2 closed; raised 2 real consistency
  defects, both fixed: (1) Documents screen '|| true' forced both POAs on
  every client while the queue required only requested ones — now ONE rule,
  requiredDocTypesForDraft (frontend) mirroring required_document_groups
  (backend), 4 unit cases pinning parity; (2) 'Submitted (Pending Review)'
  card counted raw status incl. fully-handled files — now 'Awaiting Your
  Review' showing the queue's requirement-aware total (override pinned).
- Backend 348/0-skips, frontend 129, CI green. #99 remains the proper
  lifecycle fix; #100 the deploy checklist.

## 2026-07-28 — Codex round 4: last two required-docs inconsistencies (e039b94)

- Round 4 confirmed round 3 but caught "one rule everywhere" as premature:
  (A) estate-overview.tsx still called determineRequiredDocuments with
  legacy-only signals — now uses requiredDocTypesForDraft; zero non-lib
  callsites of determineRequiredDocuments remain. (B) Will-style
  equivalence: backend group {single_will, simple_will_short} vs frontend
  always emitting the short will — frontend rule is now group-shaped
  (requiredDocGroupsForDraft) and the Documents screen resolves each group
  via resolveDocTypeForGroup (approved > generated > default), so an
  approved STANDARD will no longer strands a phantom-pending short will.
- Frontend 133 tests / typecheck / build; CI green (backend, containers,
  frontend). Backend untouched. Codex's convergence condition ("one small
  engineering consistency pass") addressed.

## 2026-07-29 — MERGED TO MAIN + engineering tail + adversarial review round

- The four-PR stack (#72 -> #73 -> #74 -> #97) is MERGED; main carries all
  launch engineering. Email decision resolved: Resend, vclawyers.ca domain
  already verified (sending enabled) — deploy needs only SMTP_* secrets
  (smtp.resend.com / user 'resend' / password = API key).
- Engineering tail landed (one commit per concern): #84 typed gift
  projection + restrictions/charity lawyer-gated; #99 evidence-based
  lifecycle (submitted->in_review->approved, recompute on every
  evidence-changing path incl. reset/config-toggle/quick-draft, chat
  locked after submission); #87 vault-aware AI proposer + estate panels;
  #92 wizard revision ratchet + serialized saves + honest conflict
  banners; #91 tokens out of URLs everywhere (links resolve POST body,
  review sessionStorage), link_type scoping both directions, expiries
  30d/14d, CSP on both servers (+/docs exemption); #85 single
  legal-statements source (Korean SLRA rendering flagged for lawyer);
  #88 resend button (questionnaire links only) + strict-startup test.
- A 30-agent adversarial review of the tail confirmed 25 defects
  (incl. HIGH: cash clause rendering another gift's recipient/amount;
  approved files vanishing from queues; review tokens doubling as
  questionnaire write credentials). All fixed in review commits A-D
  (f6f85da, bb9da58, 780e501, cb065bd). Backend 371 / frontend 152,
  zero skips, CI green on main.
- Known limitations recorded: no nonce CSP (inline scripts allowed);
  legacy wizard hydrates from localStorage only (conflict banner is
  honest about it); charity clause requires lawyer drafting by design;
  quick-draft external-AI path requires recorded client consent.

## 2026-07-29 (later) — Issues closed; owner decisions made; Stripe wired

- Closed with evidence: #76 77 78 79 80 82 84 87 88 89 91 92 98 99, and
  #81 after wiring. #86 stays open (AI-clause confirmation sub-item).
- Owner decisions (recorded on #95): payment = STRIPE online (checkout
  now linked from the self-serve submit confirmation, 46a01bd, CI
  green); dual-will = keep ask-and-flag (no change); deploy = owner
  will book the #100 session (runbook ready: Resend SMTP + Stripe
  secrets).
- #96 (checkout package wording) is now the pilot-blocking content
  review on the payment path. Next engineering after lawyer input:
  #83 residue lists (3-5 days once wording approved), #86 sub-item.

## 2026-07-29 (Codex re-review of main) — three real defects, fixed at 8c4063b

- Codex re-checked merged main and was right three times: (1) the wizard's
  revision-baseline fetch raced the first debounced save (unconditional
  overwrite still reachable) AND failed saves never retried because the
  snapshot was claimed pre-confirmation; (2) the intake page kept the
  magic token in the address bar all session (review portal pattern not
  applied) and the reminders link re-embedded it; (3) the Resend recipe
  omitted FROM_EMAIL — the placeholder noreply@ezwill.app would 403
  (domain mismatch) on every send.
- Fixes: sync() awaits the seed promise before any write; snapshot
  claimed only on confirmed success + 10s auto-retry + bilingual
  save-failure banner; intake stash-and-strip bound to the draft id
  (self-serve ids never match); reminders link clean; FROM_EMAIL boot
  gate (strict hard-stop on placeholder) + corrected docs/fly.toml +
  mandatory post-deploy email smoke test on #100.
- #91/#92 reopened then re-closed with evidence. Backend 372 / frontend
  152, zero skips, CI green at 8c4063b.
- Lesson reinforced: 'closes on merge' claims about MY OWN fixes need the
  same adversarial re-read as everyone else's — both misses were fixes
  that were directionally right but incomplete at the last hop.

## 2026-07-29 (Codex round 3) — four more defects in MY fixes; now tested (5306be1)

- Codex re-reviewed the #91/#92 fixes and was right four times:
  (1) the revision baseline failed OPEN — resolveLink returns null, not a
  throw, so the catch never ran and a failed lookup produced an
  unconditional first write; (2) submit never flushed the 1.5s debounce,
  so a client could permanently submit stale server data and the later
  save was refused as already-submitted; (3) the intake page stripped ?t
  on arrival but chapter-sync and mode-toggle rebuilt the query from a
  snapshot still holding it; (4) tokens lived in ONE global localStorage
  slot, so opening draft B destroyed draft A's refresh recovery.
- Fixes: ensureBaseline fail-CLOSED (no revision -> no save, banner,
  retry); flush() exposed via DraftSyncProvider and awaited by
  /will/review before submitDraft; ALL intake navigation routed through
  lib/intake/url-params.ts cleanUrl; DraftProvider stores tokens per
  draft (ew_draft_tokens) with legacy migration.
- 13 new tests, and I VERIFIED THEIR TEETH by reverting the fix and
  watching them go red. Frontend 165 / backend 372, CI green.
- #100 BODY (not just a comment) now carries FROM_EMAIL/FROM_NAME, the
  Resend + Stripe decisions, and a mandatory pre-client email smoke test.
- STANDING LESSON (third occurrence): a fix is not done until a test
  fails without it. Twice now I shipped directionally-correct fixes whose
  last hop was wrong, with green CI proving nothing because no test
  touched the new path. Write the failing test FIRST, or at minimum
  revert-and-watch-it-go-red before claiming a fix.
