# EZWill — Production Readiness Audit

**Date:** 2026-06-14
**Branch audited:** `feature/ai-intake-vault`
**Method:** 34-agent code audit (10 parallel subsystem readers + adversarial verification of every "production-ready" claim against the real DB/API path, not mock mode).
**Scope:** ~4.6k LOC backend (FastAPI/Postgres), ~16k LOC frontend (Next.js), 24 pages, 8 Ontario document types.

---

## Bottom line

EZWill is a **genuine, working late-stage MVP — not vaporware**. The architecture mirrors DivorceMate 1:1 (questionnaire → clause assembly → TipTap editor → export), the client portal and AI intake are real, and the backend talks to a real Postgres DB with parameterized SQL. It **demos well**.

But it is **NOT production-ready.** There is one **core-deliverable blocker** (you cannot yet generate a complete will), plus demo-grade auth, several security holes, and a dev-only deploy story. Verdict: **working prototype, ~2–4 focused weeks from a safe single-firm (V&C-only) launch**, longer for multi-firm SaaS.

| Subsystem | Status | One-line |
|---|---|---|
| Will questionnaire (7-step wizard) | 🟡 works-but-rough | Comprehensive & real; bilingual ~60% incomplete, weak validation, submit can silently fail |
| Client review portal (magic link) | 🟡 works-but-rough | Real end-to-end (email/SMS → token → approve/comment, DB-persisted); **IDOR** holes |
| Document/clause editor (vs DivorceMate) | 🟡 works-but-rough | Real TipTap editor literally ported from DivorceMate; 76-clause library |
| **Document generation (the deliverable)** | 🔴 **broken e2e** | **Clause library is frontend-only → backend exports EMPTY clause bodies** |
| AI conversational intake | 🟡 partial | Real Claude tool-use + SSE; but vault never reaches backend; unauthenticated |
| Lawyer dashboard | 🟡 works-but-rough | Real, DB-backed, auth-guarded; settings/notes don't persist |
| Backend API + auth | 🟡 works-but-rough | ~30 real routes; **auth is demo-grade**, several routes unauthenticated |
| Data model / docgen services | 🟡 partial | Real DOCX engine + 8 doc types; clause text + questionnaire data don't reach it |
| Production infra / deploy | 🔴 partial | No frontend Dockerfile, migrations don't create the schema, no CI/HTTPS/secrets |
| Live site (ezwill.ai) | ⚪ shell | Domain is up; serves an empty client-side SPA shell (no SSR content) |

---

## Direct answers to your questions

### "What functions have we done?"
A lot, and most of it is real:
- **7-step Ontario will + POA questionnaire** (About You, Family, Estate, Arrangements, POA Property, POA Personal Care, Assets/Liabilities) with localStorage autosave + debounced server draft-sync.
- **Clause-assembly document editor** — TipTap rich text, 76-clause library across 8 document types, auto-numbering, variable substitution, applicability engine, drag-reorder. Ported from DivorceMate.
- **Client review portal** — lawyer generates a magic link → delivered by GoHighLevel email/SMS → client reviews clauses, comments, approves; all persisted to Postgres.
- **AI conversational intake** — real Anthropic tool-use loop, SSE streaming, extracts structured data into a "will vault," regex fallback when no API key.
- **Lawyer dashboard** — login, client list, estate overview, clause configuration, document generation, CSV exports.
- **DOCX generation engine** — real python-docx, 8 Ontario document types with cover pages, signing/testimonium blocks, Schedule A.
- **Backend** — ~30 FastAPI routes on a real multi-tenant-capable Postgres layer.

### "Do we have a client-facing portal?"
**Yes — a real one, not a mock.** The full flow works: review link generated → emailed/texted via GHL → token validated server-side (expiry + revocation enforced) → client sees their actual generated clauses → checks "I understand," comments, approves → saved to `ew_review_approvals`/`ew_review_comments`. **Caveat:** it has **IDOR** bugs — the token isn't bound to the `draft_id` in the URL, so a valid token for client A can read/approve client B's documents by changing the path. Must fix before launch.

### "Do we have a questionnaire?"
**Yes — a comprehensive, genuinely-built 7-step wizard** with richly-typed state. It's wired to autosave and server sync. **Caveats:** bilingual EN/KO is only ~60% done (a Korean client gets English for Estate, both POAs, Assets, and the entire Review page), required-field enforcement is missing on steps 2–7, and for a magic-link client the final "submit" can fail silently (token not passed).

### "Are the editors similar to DivorceMate?"
**Yes — essentially the same editor.** EZWill's [format-clause.ts](frontend/src/lib/will-documents/format-clause.ts) is explicitly *"Ported from DivorceMate,"* and the comparison agent rated the core model, two-panel clause tree, TipTap base, variable substitution, and auto-numbering as **`ezwill-has`** (1:1). Where EZWill is **stronger**: real server-side DOCX + PDF (DivorceMate uses browser print) and a more advanced client review/approval portal. Where it's **behind**: clause-library depth (~1,222 lines vs DivorceMate's ~11,115 — though wills need fewer clauses than family-law agreements) and no in-editor AI clause-drafting copilot (EZWill's AI is on intake, not in the editor).

### "Are we ready to roll out for production?"
**No, not yet.** Three things block it, in priority order below.

---

## 🔴 P0 — Blockers (cannot launch without these)

1. **Document generation produces empty documents.** *(Corroborated by 2 independent agents.)*
   The 76-clause legal library lives **only in the frontend TypeScript** ([clause-library.ts](frontend/src/lib/will-documents/clause-library.ts)). The backend generator ([document_generator.py](backend/services/document_generator.py)) renders the *structure* (cover page, signing blocks, numbering) but has **no source of clause text** — so any clause the lawyer didn't manually hand-edit exports with an **empty body**. The core product promise — "generate a complete Ontario will" — does not work end-to-end. **Fix:** move the clause library to the backend (or have the frontend POST the full resolved clause text), and add a `template_text` column to `ew_clause_selections`.

2. **The client's answers never reach the document.** Questionnaire section data (about_you/family/estate/POA) isn't persisted to the DB in a form the generator reads, and the AI-intake "vault" is localStorage-only and is never sent to the backend on "Generate documents." So even structurally-correct documents won't contain the client's actual data. **Fix:** persist questionnaire/vault to `ew_will_drafts` (JSONB) and feed it into `_build_variables`.

3. **Auth is demo-grade.** Single shared hardcoded password (`vaturi2026`, [auth.py:13](backend/routes/auth.py#L13)), compared in plaintext, with an **in-memory token store** ([auth.py:16](backend/routes/auth.py#L16)) that logs everyone out on restart and breaks the moment you run more than one worker. `passlib`/`python-jose` are in requirements but unused. **Fix:** real per-lawyer accounts, hashed passwords, JWT or Redis/DB-backed sessions.

4. **Unauthenticated endpoints leak PII and burn paid API credits.**
   - `GET /api/documents/{draft_id}/preview/{document_type}` — **no auth**, returns the fully-rendered will/POA for any draft ID.
   - `POST /agents/will/invoke` — **no auth**, creates drafts + spends OpenAI credits.
   - `POST /api/ai/intake/chat` — **no auth**, spends Anthropic credits (rate limiter is bypassable via attacker-chosen draft_id).

5. **Pervasive IDOR.** Magic/review tokens are validated for existence but never bound to the `draft_id` they act on — so one valid token can read/update/approve *any* client's draft.

6. **Deploy is broken as shipped.** No frontend Dockerfile (the README claims one exists — it doesn't); migrations never `CREATE SCHEMA firm_demo` (the schema the app reads from), so a fresh DB has no tables where the app looks; the Next.js API URL is hardcoded to `localhost:8003`.

---

## 🟡 P1 — Should-fix before real client traffic

- PDF export shells out to a **LibreOffice binary** not guaranteed to exist in the container (60s blocking subprocess on the request thread).
- DOCX fidelity: `html_to_docx_runs` only handles bold/italic/underline — the editor's hanging-indent `(a)/(i)` structure is lost on export.
- Bilingual EN/KO ~60% incomplete (blocker if KO is a marketed feature).
- Required-field validation missing on questionnaire steps 2–7; magic-link submit fails silently.
- Review-portal XSS surface (clause HTML via `dangerouslySetInnerHTML`); no rate limiting on public token endpoints.
- Dashboard settings (firm name, LSO #, will defaults), design-sheet edits, and lawyer notes have **no save path** — data entered is lost.
- Session cookie is not HttpOnly (XSS token theft).
- Tier-2 clause selections don't reload (frontend/backend response-shape mismatch) — saved lawyer clause edits appear lost.
- No CI/CD, HTTPS/TLS, secrets management, backups, monitoring, or error tracking.

---

## 🟢 What's genuinely solid (don't rebuild these)

- Real psycopg2 DB layer with connection pooling, per-tenant `search_path`, and **fully parameterized SQL (injection-safe)** — verified adversarially.
- The DOCX structural engine and 8-document-type coverage.
- The TipTap clause editor and applicability engine.
- The client-portal *flow* (the plumbing is real; it just needs the IDOR fix + the docgen fix behind it).
- The AI intake *integration* (real Claude tool-use + SSE).

---

## Suggested sequence to launch (single firm, V&C only)

1. **Make documents real** (P0 #1 + #2): clause library on backend + persist questionnaire/vault → generator. *This is the headline — without it nothing else matters.*
2. **Real auth + close the unauthenticated/IDOR holes** (P0 #3, #4, #5).
3. **Fix deploy** (P0 #6): frontend Dockerfile, schema-creating migration, env-driven API URL; add HTTPS + a CI that runs the existing 129 backend / 51 frontend tests.
4. **P1 polish**: PDF binary bundling, settings persistence, bilingual completion, validation.

Multi-tenant SaaS (multiple firms) is a *later* phase — the machinery is half-built (`firm_*` schemas exist) but no auth binds a token to a firm. A single-firm launch sidesteps that.
