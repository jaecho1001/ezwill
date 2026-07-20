# Decision Log

> Last updated: 2026-07-19. Newest first. Product/architecture decisions live in the code
> and issues; this log captures the ones a future agent needs to know without re-deriving.

## 2026-07-19 — Generated documents are stored in Postgres, not the filesystem

- **Decision:** persist the exact delivered bytes of every generated document in
  `ew_document_generations` (`content BYTEA` + `content_sha256` + `byte_size`,
  migration 37), pointed at by `ew_document_configs.generated_file_path` as
  `db://ew_document_generations/<id>`.
- **Why:** the audit trail is a liability requirement — the firm must be able to prove
  what a client was given. DB storage rides the existing backup/tenancy story; DOCX files
  are ~50–200 KB, so bytea is fine at this scale. No filesystem coupling in containers.
- **Consequence:** re-download endpoints are draft-bound (`/{draft_id}/generations/...`);
  listing never returns bytes; storage growth is linear in generations (revisit if PDFs
  at scale).

## 2026-07-19 — Payment enforcement keys off draft origin, not caller identity

- **Decision:** `ew_will_drafts.origin` (`lawyer` default / `self_serve`, migration 38)
  plus `PAYMENT_ENFORCEMENT` env (`self_serve` default / `all` / `off`). Unpaid
  self-serve drafts get 402 at document delivery; `refunded` counts as unpaid; lawyers
  override per-request with `override_payment=true` (logged).
- **Why:** lawyer-led clients are billed by the firm outside the app; self-serve clients
  pay online. Existing rows default to `lawyer`, so nothing in flight changed behavior.
- **Consequence:** any new delivery path must call `services/payment_gate.py`; the gate
  runs before the placeholder guard so unpaid clients don't learn draft internals.

## 2026-07-19 — Incomplete documents are refused, with an explicit logged override

- **Decision:** generation collects unresolved placeholders (template misses, bracket
  literals from signing/cover pages, unmatchable `{{ tokens }}`) and returns 422 listing
  them; `allow_incomplete=true` delivers anyway and the audit row records the override
  and the missing-field list. Preview reports gaps without blocking.
- **Why:** silent corruption in a signed will is the worst failure mode; but lawyers need
  work-in-progress exports, so the override is explicit and auditable rather than absent.

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
