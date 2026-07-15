All five load-bearing claims verified against the live tree (session-secret fallback, unauthenticated `change_password`, compose/.env secret defaults + missing `AUTH_SESSION_SECRET`, the `primary_will`/`secondary_will` vs `DOCUMENT_TITLES` mismatch, zero frontend callers of `quick_draft`, and the `if (!draftId)` self-serve block). All 16 issues confirmed still open on GitHub — including the five the reconciliation marks done. Report below.

---

# EZWill — Codebase Audit & Status Update

*Branch `codex/reminders-landing-redesign` (PR #59) · 2026-07-11 · read-only audit synthesizing backend, frontend, flow/north-star, and quality/security passes*

## 1. Executive summary

EZWill's engineering foundation is genuinely strong: a real clause-based DOCX engine that produces Wills, dual wills, POAs and affidavits (71 content-asserting e2e tests), a polished bilingual 7-step questionnaire wired end-to-end, a working Claude tool-use AI intake, a token-bound review portal, and a materially hardened auth layer — 198 backend + 76 frontend tests all green. But all three north-star-defining capabilities have a critical broken seam: the client **self-serve loop is severed** (no public draft creation; submit hard-blocks on `if (!draftId)`), **automation stops short of output** (AI clause selection is unwired and the AI-draft path emits document types the generator rejects), and the app is **Ontario-hardcoded at every layer** with no jurisdiction seam. Against the north star we are roughly **30-35% there** — the pieces are high quality; the connective automation and jurisdiction abstraction are the missing work. Layered on top are several production-blocking security defects beyond the #62 hardening (forgeable admin session via default signing key, an unauthenticated password oracle, unescaped client input into `dangerouslySetInnerHTML`).

## 2. What's built

### Client-facing

| Feature | Maturity | Notes |
|---|---|---|
| Questionnaire wizard (7-step `/will/*`) | Solid | en/ko i18n, sub-step validation, AI-flag banner, debounced server sync via `useDraftSync` — **but only when a lawyer-created `draftId` exists** |
| AI conversational intake (`/intake`, `/api/ai/intake/chat`) | Partial | Real Anthropic tool-use SSE, mock/regex fallback — **but writes to a separate `WillVault` store never persisted to the server** |
| Summary / generate screen (`/summary`) | Partial | Inline-editable, generate-all — reads local vault only; "Send to lawyer" button is a **no-op stub** (`summary/[willId]/page.tsx:196`) |
| Client review portal (`/review/*`) | Solid | Token-bound, clause-level "I understand" gating, per-clause comments, bilingual — legacy stone/emerald palette |
| Reminders (`/reminders/[draftId]`) | Partial | Life-events + GHL sync wired — **100% hardcoded English, no i18n**, legacy palette |
| Marketing landing (`/`) | Solid | Manus design, magic-link resolve — advertises pricing tiers with **no payment integration built** |

### Lawyer-facing

| Feature | Maturity | Notes |
|---|---|---|
| Will Editor / clause editor (`clients/[id]/tier2`) | Solid | Strongest module (881 LOC): clause tree, applicability filter, drag/drop reorder, tiptap, variables, full-doc preview, per-doctype save |
| Dashboard CRM (drafts, client detail, magic-link, settings, legal-library) | Solid | Fail-closed login, stats, review-link creation. Client detail renders people via `JSON.stringify(...).slice(0,200)` — dev-grade UX |
| Documents page | Partial | Generate/download wired; preview panel still shows *"will render here once the backend is connected"* placeholder despite a working preview endpoint |
| Legal clause library w/ approval workflow | Solid | Version immutability, approval gate, full-text source search (`routes/legal_library.py`, 462 LOC) |
| AI clause auto-selection (`agents.py quick_draft`, OpenAI) | Stub | Backend built — **zero frontend callers** (`grep /agents/ frontend/src` = 0); automation exists on paper only |
| Signing / execution | Stub | `ew_signing_events` table exists, **nothing writes to it**; no e-sign; flow is 100% offline |

### Infra / platform

| Feature | Maturity | Notes |
|---|---|---|
| DOCX generation engine (`document_generator.py`, 1428 LOC) | Solid | Structured clause rendering, testimonium/jurat tables, witness pre-fill, Schedule A — 71 asserts on real `.docx` |
| Auth (PBKDF2-SHA256, HMAC sessions, IDOR binding, token separation) | Partial | Real hardening + 24 access-control tests — but **session key falls back to the password**; `change_password` unthrottled |
| DB layer + tenant schema + checksum migrations | Solid | Fully parameterized, `sql.Identifier` + regex-validated schema, `run_migrations.py` rejects modified applied migrations |
| Notifications (GHL/SMTP/stdout) + reminders sync | Partial | 22 tests, well-built taxonomy — **compose defaults to `stdout`** (silently doesn't send; logs PII) |
| CI (`.github/workflows/ci.yml`) | Solid | frontend typecheck/test/build + backend pg-service pytest + container builds |
| PDF conversion | Stub | Shells to LibreOffice; 503 when binary absent, no pure-Python fallback |
| Document persistence / audit trail | Stub | `generated_file_path='memory://<type>'`; `ew_document_generations` created but never written; docs regenerated per-request |

## 3. Health scorecard

| Area | Verdict |
|---|---|
| **Backend** | **Good** — well-structured, genuinely test-covered (198 passing), flagship DOCX engine is the strongest asset; weak seams are the automation→output pipeline and prod-config hygiene. |
| **Frontend** | **Good** — lawyer surfaces are strong and wired e2e, typecheck clean, 76 tests green; undermined by two parallel incompatible data models and an intake vault that never reaches the server. |
| **Flows (north-star journeys)** | **Fair** — every individual flow works, but the self-serve loop and the AI-draft→generate loop are both severed at a single connective seam each. |
| **Quality / Security** | **Fair** — #62 hardening is real and well-executed, but several production-blocking defects remain (forgeable session, password oracle, stored-XSS-to-token-theft, silent `[placeholder]` leakage). |

## 4. North-star progress: ~32%

Judged against the three pillars — full generation automation, online client self-serve, multi-jurisdiction generalizability — the foundation is high quality but the connective tissue is missing.

**Top blockers (highest leverage first):**

1. **Self-serve loop is severed.** `POST /api/drafts` and `/api/links/create` both require `verify_dashboard_token`; a landing-page client gets `/will/about-you` but no backend draft, and submit hard-blocks on `if (!draftId) { setSubmitError(...); return }` (`will/review/page.tsx:56`). Only lawyer-initiated flows reach the backend — pillar (2) is a local-only demo.
2. **No jurisdiction seam.** No `jurisdictions/registry.ts` or `services/jurisdictions.py` exists; ~189 Ontario/SLRA references span TS types, Python docgen, SQL, i18n, and the AI prompt. `JURISDICTION_AUDIT.md`'s P0 registry is not started — every expansion is blocked here, and a non-ON province today **silently generates wrong statutes** rather than erroring.
3. **AI clause selection is unwired + vocabulary-broken.** `quick_draft` has zero UI callers, and it emits `primary_will`/`secondary_will` (`agents.py:64`) which `DOCUMENT_TITLES` (`document_generator.py:32-41`) does not recognize — so even if wired, AI-drafted wills **cannot be generated**. Clause selection is otherwise a static per-doctype default, not conditioned on client answers.
4. **No signing/execution flow.** `ew_signing_events` is unused; the final north-star step (Will+POA execution) is entirely outside the app, and the schema hardcodes the Ontario 2-witness in-person/remote model.
5. **No monetization or document persistence.** Pricing is advertised but no Stripe/checkout exists; generated docs are never stored, so there's no audit trail of what a client approved or signed.

## 5. GitHub issue reconciliation

All 16 audited issues are **still open on GitHub** (confirmed via `gh issue list`). Five are effectively done and should be closed now.

| Issue | Status | Recommendation |
|---|---|---|
| **#63** SMTP notifications + person auto-fill | Done (now committed) | **CLOSE** — both features committed with tests |
| **#61** Prepopulate role forms from spouse/children | Done | **CLOSE** — `person-suggestions.ts` wired into 4 pages + tests |
| **#60** SMTP provider for outbound email | Done | **CLOSE** — `NOTIFICATION_MODE=smtp` implemented, subset of #63 |
| **#55** CI pipeline | Done | **CLOSE** — 3-job workflow exceeds acceptance criteria |
| **#40** Agent Manager (`will_agent`) integration | Done | **CLOSE** — `/will/invoke` + capabilities + agent-token auth, tested |
| **#62** Security/workflow/deploy hardening | Partial | **UPDATE & keep** — most items done; HttpOnly cookie + `firm_demo` single-tenant open |
| **#64** Versioned Annotated Will pipeline | Partial | **Keep** — DB foundation shipped; edition diffing, TS→DB migration, missing `clause-library.json` unresolved |
| **#57** Secrets management | Partial | **Keep — escalate to P0** — compose still defaults `vaturi2026`/`ezwill_dev`; `AUTH_SESSION_SECRET` undocumented |
| **#46** Clause-editor/intake session (Phases 1-6) | Done (tracking) | **Keep** — follow-ups open (dead "Send to lawyer" button, Phase 7) |
| **#44** GHL workflow correction | Not started | **Keep** — `create_review_link` still sends via GHL; no signing-reminder route |
| **#54** HTTPS/TLS + secure cookies | Not started | **Keep** — no TLS termination; cookie still `document.cookie` |
| **#58** Monitoring / structured logging | Not started | **Keep** — no Sentry/OTel/request IDs |
| **#56** Automated Postgres backups | Not started | **Keep** — no backup/restore anywhere |
| **#52** Real per-lawyer auth / SSO | Not started | **Keep** — deferred by owner until function-test sign-off |
| **#45** Future doc types (codicil, memoranda) | Not started | **Keep** — roadmap |
| **#42** Future vision (AI beyond wills) | Not started | **Keep** — living roadmap doc |

## 6. Prioritized roadmap

**P0 — do now (blocks a safe commercial demo):**
- **Make `AUTH_SESSION_SECRET` mandatory and independent of the password** (fail startup if unset; remove the `DASHBOARD_PASSWORD` fallback at `auth.py:110`). *Eliminates the forgeable-admin-session exploit — the single most severe finding; a default compose deploy signs sessions with the repo-committed `vaturi2026`.*
- **Remove all secret defaults** from `docker-compose.yml` + `.env.example`, delete the dead `SECRET_KEY` line, make Postgres creds overridable (resolves #57). *Committed default credentials are directly exploitable.*
- **Authenticate + throttle `/change-password`.** *Closes an unauthenticated, unthrottled password brute-force oracle that bypasses the login limiter.*
- **HTML-escape client variable substitutions / sanitize clause HTML** before every `dangerouslySetInnerHTML` sink. *Prevents stored XSS from a client name field executing in the lawyer's non-HttpOnly dashboard origin → token theft.*
- **Close the self-serve loop:** add a rate-limited/CAPTCHA'd public draft-creation endpoint and unblock review submit. *Restores north-star pillar (2), currently non-functional for a self-initiated client.*
- **Unify the will document-type vocabulary** so `quick_draft` output is generatable, and **add a pre-generation guard** that rejects unresolved `[placeholder]` tokens. *Today the AI-draft→generate path produces nothing for wills, and a will can silently ship with literal `[executorName]` text.*

**P1 — next (turns automation-on-paper into working automation):**
- **Persist the intake `WillVault` to the server** (or consolidate onto the server-synced `WillDocument` model). *Without this the AI-intake self-serve flow doesn't work cross-device and the lawyer can't see client intake.*
- **Execute `JURISDICTION_AUDIT.md` P0:** build the CA-ON-only jurisdiction registry (FE+BE mirror) and route the three `'Ontario'` fallbacks, both `isMinor` helpers, and `_PROVINCE_RE` through it. *Creates the seam every expansion depends on; audit rates it a snapshot-identical extraction.*
- **Wire AI clause selection** (or apply the existing applicability engine to `buildDefaultSelections`) so the Will Editor opens auto-tailored to client answers. *Turns generation from variable-fill into genuine automated drafting (pillar 1).*
- **Move the session cookie to server-set HttpOnly + Secure + SameSite** (#54). *Removes the XSS-to-token-theft primitive.*
- **Reconcile the trust-distribution-age default** (backend 21 vs frontend 25) into one registry value + snapshot test. *Silent document-correctness bug that varies by code path.*
- **Wire or remove the two dead client-facing CTAs** ("Send to lawyer for review", "Download Summary PDF"). *Dead CTAs on hand-off screens erode client trust.*

**P2 — later (scale + polish):**
- **Add a signing/execution flow** writing to `ew_signing_events` + persist generated document bytes with versioning. *Completes the last manual journey step and the legal audit trail; forces the signing-schema normalization multi-jurisdiction needs.*
- **Prove the jurisdiction seam with CA-BC** (age 19, no FLA, BC probate schedule, "Executor" terminology). *Validates the abstraction before scaling to US states.*
- **Observability + PII hygiene:** Sentry/OTel + request IDs (#58), and flip the compose `NOTIFICATION_MODE` off `stdout` so the default deploy actually sends and stops logging client email bodies.
- **Consolidate to one i18n mechanism** and route `/summary` + `/reminders` through the central en/ko dict; migrate `review/*`+`reminders` to the Manus palette; replace the 45 hardcoded `#1B2A4A` literals with tokens.
- **Parse `X-Forwarded-For` and move rate-limit/session state to a shared store**; introduce real per-firm schema selection instead of the single `firm_demo` constant. *Backups (#56), TLS (#54), SSO (#52) as ops matures.*

## 7. Top risks to watch

1. **Forgeable admin session (default signing key).** *Confirmed:* `_session_secret()` returns `DASHBOARD_PASSWORD` when `AUTH_SESSION_SECRET` is unset (`auth.py:104-113`), and that var appears in neither `docker-compose.yml` nor `.env.example`. Any compose-default deploy signs sessions with the committed value `vaturi2026` → full dashboard access to all client PII with no login. **Persists even after a password change** unless the secret is explicitly set.
2. **Unauthenticated password oracle.** `change_password` (`auth.py:245`) has no auth dependency and no rate limit — unlimited-rate brute force that bypasses the login throttle.
3. **Stored XSS → lawyer token theft.** Client fields flow unescaped through `resolve_variables` into clause HTML rendered via `dangerouslySetInnerHTML` in both the review portal and the lawyer clause editor, while the dashboard token lives in a non-HttpOnly `document.cookie` — a `<img onerror>` in a name field is account takeover.
4. **Silent legal-document corruption.** Missing variables render as literal `[executorName]` into a signed `.docx` with no runtime rejection — the worst failure mode: silent, not loud.
5. **Silent legal incorrectness off-Ontario.** `province` defaults to `'Ontario'`; a non-ON draft generates SLRA/FLA/Estate-Trustee citations rather than erroring — a live correctness landmine the moment a second province is entered before the jurisdiction seam exists.
6. **Two divergent client data models + non-persisted intake vault.** `WillDocument` (server-synced) vs `WillVault` (local-only) collect the same facts; double-maintenance, divergence risk, and the intake path's data never reaches the lawyer.
7. **Review tokens over-scoped.** `resolve_link` (`db.py:265-273`) lacks the `link_type` filter its review counterpart has, so a leaked 30-day review token can replay onto the questionnaire-edit path and the paid AI-intake endpoint.