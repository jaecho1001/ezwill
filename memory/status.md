# Status — where we left off

> Last updated: 2026-07-14.

- **This change:** bootstrapping the agent brain on a branch (`add-agent-brain`, PR to
  `main`). Adds `NORTH-STAR.md`, `AGENTS.md`, pointer `CLAUDE.md`, and `memory/` as an
  additive documentation layer. **No source code touched.**
- **App state (from code + README):** substantially built and not yet run end-to-end
  against a real database. Frontend (Next.js 16, three portals) and backend (FastAPI,
  8 routers, 6 services, migrations 25–27) are in place; ~129 backend pytest functions plus
  a frontend Vitest suite exist.
- **Verified this session:** `ew_` table prefix and 14 `ew_*` tables (migrations 25–27);
  `firm_{id}` tenancy in `services/db.py` (regex + `SET search_path` + `sql.Identifier`);
  `ix_cross_client_map.ew_client_id` amendment (identity link only, no event bus);
  Next.js 16/React 19 + FastAPI stack; ports 3000/8003; DB `caselawvision`; OpenAI-backed
  will agent; GoHighLevel notifications (replaced SendGrid).
- **Next step:** merge this PR, then the first real-code task is applying migrations to a
  `firm_demo` schema and proving the end-to-end flow against a live DB (README "Must Do").
- **Open questions:** `ix_` event-bus scope (planned vs. build now); production backend host
  (#65 covers Vercel + Supabase for FE/DB, not the FastAPI host); session/token store
  (in-memory today vs. Redis/JWT in #52); Python floor (3.12 Docker vs. 3.9 source). See
  `AGENTS.md` → Open questions.
- **Guardrail:** all generated legal documents are draft-only and lawyer-approved; keep
  tenant isolation intact; never commit secrets/PII.
- **Note:** the `caselawvision-platform` Bible still marks EzWill "Planned / Stack: TBD" —
  stale; the app is built. Flag for a Bible update.
