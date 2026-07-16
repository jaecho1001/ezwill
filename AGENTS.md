# AGENTS.md — EzWill agent brain

> Canonical, tool-neutral instructions for this repository.
> Last updated: 2026-07-14.

EzWill is the CaseLawVision platform's **Ontario will & estate planning app** (Pillar 1,
Legal delivery). This repo maintains a persistent brain in this file plus `NORTH-STAR.md`
and `memory/`. Preserve true existing guidance and verify claims against the code before
changing the brain. The platform-wide contract lives in the `caselawvision-platform` Bible.

## Before every session

1. Read `NORTH-STAR.md`.
2. Read `memory/00-index.md`, then `memory/status.md`, then task-relevant memory files.
3. Run `git status --short --branch`, `git log --oneline -10`, and
   `gh issue list --state open --limit 20` before substantive work.

## Mission summary

EzWill turns a bilingual (EN/KO) client questionnaire into lawyer-reviewed Ontario wills,
powers of attorney, and supporting documents. Three portals share one app: a public
client questionnaire (magic-link), a password-protected lawyer dashboard, and a client
review portal. An AI drafting agent proposes clause selections; a lawyer approves before
anything reaches a client. It owns `ew_`-prefixed tables on the shared platform database.

## Standing rules

- **Work directly on `main`; never force-push `main`.** (Owner pushes to `main`; PR the
  first brain change.)
- **Legal output is draft-only and lawyer-approved.** AI drafts wills/POAs/clauses; a
  lawyer reviews and approves. Never present generated documents as final or filed.
- **Tenant isolation is sacred.** Scope every query by `firm_{id}` schema
  (`^firm_[a-z0-9_]+$`), `SET search_path` before queries, `psycopg2.sql.Identifier()`
  for quoting, parameterized SQL only. Never trust a client-supplied schema/tenant id.
- **Own only `ew_` tables.** Never write another app's prefixed tables; touch `ix_*`
  shared tables only through the documented integration contract.
- **Never track secrets, tokens, cookies, PII, or client data.** `.env` and
  `backend/.env` stay ignored. Names and boolean status only in docs.
- **Preserve unrelated user changes** in a dirty worktree.
- **Explain every git action in plain English** a non-engineer (a lawyer) can follow —
  in the reply and mirrored in the commit body ("Legible changes" in `NORTH-STAR.md`).
- **Keep brain commits separate** from source changes: `chore(brain): <what changed>`.
- **Dates `YYYY-MM-DD`; no emoji in new docs.**

## Architecture at a glance

Next.js 16 + React 19 frontend (`frontend/`, :3000) calls a FastAPI backend
(`backend/main.py`, :8003). FastAPI owns the Postgres connection pool, tenant-aware
`ew_*` table CRUD, magic-link and dashboard auth, document generation (python-docx), an
OpenAI-backed will-drafting agent, and GoHighLevel (GHL) notifications. PostgreSQL 16
(db `caselawvision`) is the system of record, with `firm_{id}` per-tenant schemas and
`ew_`-prefixed tables. Cross-app identity links through the shared `ix_cross_client_map`.
Local orchestration is Docker Compose (`db` + `backend` + `frontend`). See
`memory/architecture.md`.

## Key commands

| Task | Command |
|------|---------|
| Install frontend deps | `cd frontend && npm install` |
| Frontend dev (:3000) | `cd frontend && npm run dev` |
| Frontend build | `cd frontend && npm run build` |
| Frontend tests (vitest) | `cd frontend && npm run test` |
| Install backend deps | `cd backend && pip install -r requirements.txt` |
| Backend dev (:8003) | `cd backend && uvicorn main:app --port 8003 --reload` |
| Backend tests (pytest) | `cd backend && python -m pytest` |
| Full stack (Docker) | `docker-compose up` |
| Apply DB migrations | `SET search_path TO firm_demo;` then `\i` migrations 25→26→27 (see `memory/architecture.md`) |

Run `uvicorn` from inside `backend/` — imports resolve relative to that directory.

## Memory map

| File | Holds |
|------|-------|
| `NORTH-STAR.md` | shared platform mission and this repo's role |
| `memory/product.md` | problem, users, scope, success, and pillar fit |
| `memory/architecture.md` | portals, services, data model, integration, environments |
| `memory/decisions.md` | dated decisions, newest first |
| `memory/glossary.md` | domain terms, `ew_*` tables, Ontario statutes |
| `memory/conventions.md` | standing rules, gotchas, testing expectations |
| `memory/roadmap.md` | Now / Next / Later / Done by platform pillar |
| `memory/status.md` | concise current state; points to next work |
| `memory/learnings.md` | append-only improvement journal |

## Self-Improvement Protocol

Run once at the end of every substantive session:

1. **Reflect** — identify facts, decisions, or lessons not yet captured.
2. **Update status** — always update `memory/status.md`.
3. **Update only what changed** — decisions, conventions, architecture, glossary,
   roadmap, or product; append one dated learning.
4. **Improve the system when warranted** — tighten prompts or conventions.
5. **Keep the index honest** — bump dates in `memory/00-index.md` for touched files.
6. **Verify** — review diffs, run proportional checks, confirm no secret/PII entered.
7. **Save back** — commit brain-only changes separately as `chore(brain): <what changed>`.

Guardrails: prefer additive, reversible edits; mark genuine guesses `⚠️ ASSUMPTION`; ask
before changing mission, deleting a standing rule, or weakening legal/compliance safeguards.

## Open questions

- The `ix_*` **event bus** (publishing `ew.will.created`, `ew.poa.created`, etc. to
  `ix_sync_events`) is described in the Bible's EzWill blueprint but is **not yet
  implemented** — only the `ix_cross_client_map.ew_client_id` identity column exists in
  migration 25. Confirm intended scope before asserting live cross-app sync.
- **Persistent backend host** for production is unresolved: issue #65 targets Vercel +
  Supabase for frontend/db; the FastAPI host is TBD.
- **Session/token store:** dashboard auth uses in-memory Bearer tokens (don't survive
  restart); the platform design calls for Redis/JWT (issues #52, #57). No Redis in the
  local stack yet.
- **Python floor:** the Dockerfile pins `python:3.12-slim` but the code is written for
  3.9+ compatibility. Confirm the intended runtime target.
- The `caselawvision-platform` Bible still lists EzWill as "Status: Planned / Stack: TBD";
  the app is in fact substantially built. The Bible's EzWill blueprint needs updating.
