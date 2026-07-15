# Decision Log

> Last updated: 2026-07-14. Newest first. Product/architecture decisions live in the code
> and issues; this log captures the ones a future agent needs to know without re-deriving.

## 2026-07-14 — Adopt the shared, self-improving agent brain

- **Decision:** add `NORTH-STAR.md`, `AGENTS.md`, a pointer `CLAUDE.md`, and `memory/` as
  an additive documentation layer, without touching source code.
- **Why:** every Codex/Claude session should start already knowing the app, its pillar
  fit, tenancy model, and standing rules instead of re-deriving them each time.
- **Consequence:** substantive sessions run the Self-Improvement Protocol and commit
  brain-only changes as `chore(brain): …`.

## 2026-07-14 — GoHighLevel replaces SendGrid for notifications (commit `838de48`)

- **Decision:** send client/lawyer email + SMS through the GoHighLevel (GHL) Conversations
  API instead of SendGrid, as one unified messaging channel.
- **Why:** single provider for both email and SMS; aligns with the firm's CRM tooling.
- **Consequence:** `notification_service.py` speaks GHL; `requirements.txt` drops SendGrid;
  config is `GHL_API_KEY` / `GHL_LOCATION_ID` / `NOTIFICATION_MODE`. Note issue #44 asks to
  scope GHL messaging to appointments only (no review link via GHL) — not yet reconciled.

## Standing platform decisions EzWill inherits (from the CaseLawVision Bible)

- **Per-tenant `firm_{id}` schema isolation** on one shared PostgreSQL 16, validated
  `^firm_[a-z0-9_]+$`, `SET search_path` before queries — implemented in `services/db.py`.
- **App-owned tables under a registered prefix:** EzWill owns the **`ew_`** prefix.
- **`ix_*` integration layer** for cross-app data sharing. EzWill implements the identity
  hook (`ix_cross_client_map.ew_client_id`) only; the `ix_sync_events` event bus is planned,
  not built. ⚠️ ASSUMPTION on intended scope — see Open Questions in `AGENTS.md`.
- **Legal output is draft-only and lawyer-approved** — the AI drafts, a lawyer decides.

## Ontario domain decisions baked into the product

- **Dual will strategy** (probate + non-probate wills) to reduce Estate Administration Tax —
  drives the two "primary_will"/"secondary_will" document types and the agent's prompt.
- **Clause library grounded in the Law Society of Ontario Annotated Will (2026)** plus firm
  precedent — 60+ clauses across 15 sections (`frontend/src/lib/will-documents/`).
- **9-rule AI flagging engine** tied to Ontario statutes/case law (FLA exclusion, Henson
  trust, SLRA separation, GRE, guardian expiry, RESP, Saunders v. Vautier, US-person tax,
  Pecore) — advisory flags a lawyer reviews.
