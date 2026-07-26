# Status — where we left off

> Last updated: 2026-07-26.

- **This session:** opened GitHub issue #75 with the plain-English product rationale,
  nine-section questionnaire, privacy/accessibility requirements, phases, and acceptance
  criteria. Implemented its production-critical first slice:
  1. versioned `WillVault` schema 2 with safe migration from the earlier six-section vault;
  2. nine guided sections covering identity, family, executors/guardians, residue,
     specific gifts, trusts, assets/debts, both POAs, and final wishes;
  3. conditional questions and final validation, including named primary appointees and
     100% beneficiary allocation when percentages are chosen;
  4. lawyer-created magic links now enter `/intake/{draftId}`; token resolution restores
     the server vault/contact data and returns `Cache-Control: no-store`;
  5. debounced, draft-id-bound vault autosave projects people/assets/liabilities into the
     existing lawyer-dashboard tables;
  6. the client summary no longer generates documents — it reviews answers, requires an
     acknowledgement, and submits them to the lawyer;
  7. the lawyer dashboard shows the canonical vault, its real completion, and deterministic
     issue-spotting flags without auto-approving legal strategies;
  8. frontend/Python document-variable projection now covers primary POA attorneys,
     corporate trustee, first gift/charity, beneficiary, and selected trust age.
- **Verified:** backend 281 passed / 2 real-DB tests skipped without a configured DB;
  frontend 88 passed; TypeScript clean; Next.js production build clean; `git diff --check`
  clean.
- **Important context:** this working copy (`ezwill-main` on Desktop) was a ZIP snapshot
  with no git history. A local git repo was initialized 2026-07-19 (baseline `e696d89`);
  there is no remote, although the GitHub app/CLI can access `jaecho1001/ezwill`. Local
  commits must still be exported or reconciled with the real repository.
- **Previously completed launch safeguards:** unresolved-placeholder refusal with logged
  lawyer override; durable generated-document bytes and SHA-256; payment gate; vault sync;
  send-to-lawyer; deterministic generation ordering; adversarial review fixes. See commits
  `1c5e0ef` through `ed5e19f`.
- **Known issue #75 follow-up:** the public self-serve marketing CTA still enters the
  legacy `/will/*` flow; only lawyer-created magic links are switched. The legacy
  `WillDocument` remains during migration. Form/chat reuse of a previously entered person
  is not built. The new summary page is English-only and needs full EN/KO parity.
  Real-user accessibility/usability testing and a real-Postgres cross-device walk remain.
- **Next step:** review this source commit, run the real-DB path, then complete issue #75:
  bilingual summary/validation, reusable people, self-serve routing, document-placeholder
  coverage matrix, and retirement/redirect of `/will/*` only after parity is proven.
- **Machine note:** Docker Desktop previously consumed 112 GB and filled the Mac disk;
  reclaim Docker disk space before heavy local database work.
- **Guardrail:** unchanged — legal output draft-only and lawyer-approved; tenant isolation
  intact; no secrets/PII committed.
