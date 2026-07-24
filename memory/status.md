# Status — where we left off

> Last updated: 2026-07-23.

- **This session:** fixed the five commercial-launch blockers from the readiness
  assessment, all committed locally with plain-English commit bodies:
  1. Unresolved-placeholder guard — generation returns 422 listing missing fields
     instead of silently shipping `[executorName]` text; lawyer override via
     `allow_incomplete=true`; preview lists gaps (`1c5e0ef`).
  2. Document persistence — migration 37 stores the exact delivered bytes +
     SHA-256 in `ew_document_generations` (previously write-orphaned); new
     `/generations` list + draft-bound re-download endpoints (`52da6d9`).
  3. Payment gate — migration 38 adds `ew_will_drafts.origin`
     (`lawyer`/`self_serve`); unpaid self-serve drafts get 402 before delivery;
     `PAYMENT_ENFORCEMENT` env (default `self_serve`); logged
     `override_payment` escape hatch (`52da6d9`).
  4. Vault sync — `PUT /api/drafts/{id}` accepts `vault`/`client_email`/
     `client_phone` from draft-bound magic tokens; firm notification falls back
     to the vault testator name (`c256ca2`).
  5. Send-to-lawyer wired — summary page ensures a server draft, collects the
     client's email, syncs the vault, submits, firm gets the email (`c256ca2`).
  Plus `d6cbb4e`: real-DB test caught nondeterministic audit ordering
  (transaction-timestamp ties) → `clock_timestamp()` + id tiebreaker.
- **Verified:** backend 271 passed / frontend 80 passed + typecheck clean /
  migrations 00→38 applied twice (idempotent) on a real Postgres 16 + both
  real-DB integration tests green.
- **Important context:** this working copy (`ezwill-main` on Desktop) was a ZIP
  snapshot with no git history. A local git repo was initialized 2026-07-19
  (baseline `e696d89`) so every fix is a reviewable commit — but there is **no
  remote**; commits must be exported/pushed to the real repository. The July
  audits (AUDIT_UPDATE.md 2026-07-11) are stale: their top security P0s were
  already fixed upstream before this snapshot.
- **Adversarial review (completed 2026-07-23, commit `ed5e19f`):** 4 confirmed
  findings fixed (blank-value guard blind spot; preview/generation parity via a
  discarded generation pass; malformed-UUID 404; type-guarded vault name
  fallback) plus 2 hand-verified from its unadjudicated list (commissioner
  bracket excluded from the scan — fill-at-commissioning; dashboard documents
  page now surfaces 422/402 reasons). Caveat: the review's security lens
  errored and 53/71 verifier agents died on org spend limits — the
  unadjudicated findings were triaged by hand instead.
- **Known limitations (documented, not bugs):** one global client draft id
  (a second local will would write the same server draft's vault); vault-only
  submissions show no name in the dashboard client LIST (email names them);
  re-send after edits syncs data but sends no second notification; summary
  page's client-facing Generate button still dead-ends on dashboard auth
  (pre-existing).
- **Next step:** reconcile these commits with the real GitHub repo (push or
  `git format-patch e696d89..HEAD`) and run CI there — including the real-DB
  persistence test on migrations 37/38. Then: generations audit-trail UI in
  the dashboard, and an in-dashboard override control for 422/402.
- **Machine note:** the Mac's disk hit 100% full mid-session (Docker Desktop VM
  is 112 GB; caches ~14 GB); ~1 GB was freed during the session. Reclaim via
  Docker Desktop → Settings → Resources → Disk before heavy local work.
- **Guardrail:** unchanged — legal output draft-only and lawyer-approved;
  tenant isolation intact (all new queries parameterized, schema-scoped);
  no secrets/PII committed.
