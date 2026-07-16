# North Star

> The shared mission every project in the platform ladders up to.
> Last verified: 2026-07-14. Keep the shared-mission section identical across repos.

## Shared mission

Build agentic AI that scales law firms and makes legal service dramatically more
efficient — for lawyers and the clients they serve.

## What we're building

One connected legal platform where AI agents handle the work that slows firms down,
across four pillars:

1. **Legal delivery** — intake, document processing, timelines, drafting, review, filings.
2. **Marketing** — client acquisition, content, campaigns, SEO, reputation.
3. **Branding** — consistent firm voice, identity, and positioning across every touchpoint.
4. **Connected tools** — integrations that unify the firm's stack (email, calendar,
   docs, DMS, CRM, e-sign, billing) so agents act across systems, not silos.

## Who it serves

- **Firm owners / partners** — scale capacity and revenue without linear headcount.
- **Lawyers** — less admin, faster turnaround, more time on legal judgment.
- **Clients** — faster, clearer, more affordable service.

## How

Agentic AI is the connective layer: agents plan, use tools, and complete workflows
end-to-end, with humans in the loop wherever judgment and liability demand it.

## Principles

- **Verifiable outputs** — citations and provenance on anything that informs legal work.
- **Human-in-the-loop** for legal judgment, filings, and anything carrying liability.
- **Legible changes** — every change is explained in plain language a non-engineer
  stakeholder (a lawyer, a firm owner) can follow, git operations included. The
  humans in our loop are lawyers, not engineers; you cannot approve what you cannot
  understand, so plain-English legibility is what makes human-in-the-loop a real
  checkpoint instead of a rubber stamp. This is why every git action carries a
  plain-English explanation (see each repo's conventions).
- **Privacy and compliance by default** — never expose secrets, PII, or client data.
- **Every project ladders up** — if a repo does not advance a pillar, say why it exists.

## This repo's role

`ezwill` is the **EzWill app** — a client-facing, AI-assisted **Ontario will and estate
planning** product built by Vaturi & Cho LLP and part of the CaseLawVision platform. It
turns a bilingual (EN/KO) client questionnaire into lawyer-reviewed wills, powers of
attorney, and supporting documents, with a lawyer dashboard and a client review portal.

It advances **Legal delivery** (Pillar 1) directly — intake, drafting, review, and
document generation for a specific legal domain — and rides the platform's **Connected
tools** backbone (Pillar 4): the shared PostgreSQL `firm_{id}` tenancy model and the
`ix_*` integration layer. EzWill owns tables under the registered **`ew_`** prefix and
links clients into the platform via the `ix_cross_client_map` table. All generated legal
documents are **draft-only and lawyer-approved** before they reach a client — the AI
drafts, a lawyer decides. Platform-wide architecture and standards live in the
`caselawvision-platform` Bible, which EzWill builds against.
