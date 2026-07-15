# Product — EzWill

> Last verified: 2026-07-14 against `README.md`, `backend/`, `frontend/`, and migrations.

## Problem

Ontario estate planning is document-heavy, statute-sensitive, and slow. Gathering a
client's family, assets, executors, and wishes; selecting the right clauses (dual will,
Henson trust, FLA exclusion, GRE, guardianship); and producing execution-ready wills and
powers of attorney is repetitive lawyer work that is easy to get subtly wrong. Clients
also struggle to complete intake accurately, especially across a language barrier.

## What EzWill does

EzWill turns a guided, bilingual (EN/KO) client questionnaire into lawyer-reviewed Ontario
wills, powers of attorney (property and personal care), and supporting documents. It has
three portals in one app:

- **Client Questionnaire** (`/will/*`, public via magic link) — About You, Family, Estate,
  Arrangements, POA Property, POA Personal Care, Assets/Liabilities, Review, Submit.
- **Lawyer Dashboard** (`/dashboard/*`, password auth) — client list, estate overview,
  AI flags, a Tiptap clause editor (Tier 2), a design sheet, and document generation.
- **Client Review Portal** (`/review/*`, review link) — clause-by-clause review with
  "I understand" acknowledgements, comments, and approvals.

An AI drafting agent proposes clause selections and quick drafts from questionnaire data;
an Ontario AI-flagging engine (9 statute-based rules) surfaces risks. A lawyer reviews and
approves before anything is finalized. Documents are generated with python-docx.

## Users

- **Lawyers at Vaturi & Cho LLP** — operate the dashboard, review AI drafts, approve and
  generate documents. The humans in the loop for all legal judgment.
- **Estate-planning clients** — complete the questionnaire and review documents via
  magic/review links; bilingual EN/KO.

## Scope

- **In scope today:** Ontario wills, dual wills (probate/non-probate), POA for property,
  POA for personal care, affidavits of execution; clause library (60+ clauses, 15
  sections); AI flagging; DOCX generation; magic-link intake and client review.
- **Not in scope / draft-only:** filing, execution, and any final legal advice — those
  stay with the lawyer. Life-insurance/tax optimization and business succession are future
  vision (issue #42).

## Success

A lawyer can create a client, send a magic link, receive a completed questionnaire, review
AI-flagged risks, edit clauses, and generate execution-ready Ontario documents — all
tenant-isolated per firm and lawyer-approved before finalization.

## Constraints

- **Legal liability** — every generated document is draft-only and lawyer-approved.
- **Ontario-specific correctness** — clauses and flags track Ontario statutes and case law
  (SLRA, SDA, CLRA, FLA, Trustee Act, ITA, EAT Act, ODSPA, and others).
- **Tenant isolation and privacy by default** — per-firm `firm_{id}` schema; no PII or
  secrets in the repo.

## Pillar fit

Primarily **Legal delivery (Pillar 1)** — domain-specific intake, drafting, review, and
document generation. It rides the platform's **Connected tools (Pillar 4)** backbone: the
shared `firm_{id}` tenancy model and the `ix_*` integration layer (identity linking via
`ix_cross_client_map`). See `NORTH-STAR.md` → "This repo's role".
