# Glossary — EzWill

> Last verified: 2026-07-14. Terms and entities with where they're defined.

## Platform / integration

- **CaseLawVision** — the parent legal-tech platform; its `caselawvision-platform` repo is
  the authoritative Bible for architecture, tenancy, and the `ix_*` integration contract.
- **`firm_{id}` schema** — per-tenant PostgreSQL schema (one law firm = one schema),
  validated `^firm_[a-z0-9_]+$` (`backend/services/db.py`). Local default `firm_demo`.
- **`ew_` prefix** — EzWill's registered table prefix; all app-owned tables start with it.
- **`ix_cross_client_map`** — shared platform table linking one client's ids across apps;
  EzWill adds an `ew_client_id` column (migration 25) to join will drafts to platform identity.
- **`ix_sync_events`** — the platform event bus for cross-app sync. Referenced by the
  Bible's EzWill blueprint but **not yet implemented** in this repo.

## EzWill entities (`ew_*` tables, migrations 25–27)

- **`ew_will_drafts`** — core client/will record; carries cross-app ids
  (`ew_client_id`, `ar_client_id`, `lt_client_id`, `cross_client_map_id`) and status.
- **`ew_people`** — persons referenced by a draft (spouse, children, executors, attorneys,
  guardians, beneficiaries).
- **`ew_assets` / `ew_liabilities`** — estate inventory with probate classification.
- **`ew_ai_flags`** — stored results of the Ontario AI-flagging engine.
- **`ew_client_links`** — magic/review link tokens bound to a draft.
- **`ew_design_sheets`** — lawyer's design sheet (will type, beneficiary %, trusts,
  executor chain, POA assignments).
- **`ew_trusts`** — trust definitions (minor's trust, Henson trust, spousal trust).
- **`ew_clause_selections` / `ew_document_configs`** — selected clauses and per-document config.
- **`ew_signing_events` / `ew_document_generations`** — signing/generation audit records.
- **`ew_review_approvals` / `ew_review_comments`** — client review portal acknowledgements.

## Portals

- **Client Questionnaire** (`/will/*`) — public, magic-link intake wizard.
- **Lawyer Dashboard** (`/dashboard/*`) — password-authenticated firm workspace.
- **Client Review Portal** (`/review/*`) — review-link, clause-by-clause client review.

## Ontario legal terms (drive clauses + AI flags)

- **Dual will** — separate probate (primary) and non-probate (secondary) wills to save
  Estate Administration Tax (probate fees, ~1.5% of estate value over $50,000 in Ontario).
- **FLA exclusion** — Family Law Act s.4(2)(2) clause excluding gifts from net family
  property; flagged Critical if missing.
- **Henson trust** — discretionary trust preserving an ODSP beneficiary's benefits.
- **GRE** — Graduated Rate Estate (36-month, anti-tainting) maintenance clause.
- **SLRA / SDA / CLRA / FLA / EAT Act / ODSPA / ITA** — the Ontario statutes the clause
  library and flagging engine track (Succession Law Reform Act; Substitute Decisions Act;
  Children's Law Reform Act; Family Law Act; Estate Administration Tax Act; Ontario
  Disability Support Program Act; Income Tax Act).
- **POA Property / POA Personal Care** — Continuing Power of Attorney for Property; Power
  of Attorney for Personal Care.

## Platform / brain terms

- **Agent brain** — the `NORTH-STAR` / `AGENTS` / `CLAUDE` / `memory` documentation layer
  that onboards AI agents to this repo; additive docs, not source code.
- **Will-drafting agent** — the `/agents/will/invoke` OpenAI-backed endpoint that proposes
  clause selections and quick drafts for lawyer review.
