# EZWill — Ontario Will & Estate Planning Platform

Bilingual (EN/KO) will-building application for Ontario, Canada. Part of the [CaseLawVision](https://github.com/jaecho1001/caselawvision) platform.

## Architecture

Three-portal system on a single Next.js 16 app:

| Portal | Route | Audience | Status |
|--------|-------|----------|--------|
| Client Questionnaire | `/will/*` | Public (magic link) | Built |
| Lawyer Dashboard | `/dashboard/*` | Lawyers (password auth) | Built |
| Client Review Portal | `/review/*` | Clients (review link) | Built |

## Tech Stack

| Layer | Technology | Port |
|-------|-----------|------|
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 | :3000 |
| Backend | FastAPI (Python 3.9+) | :8003 |
| Database | PostgreSQL 16 with `firm_{id}` schema isolation | :5432 |
| Editor | Tiptap (ProseMirror) — bold, italic, underline, highlight, {{placeholder}} syntax | — |
| Documents | python-docx — table-based signing pages, cover pages | — |

## Getting Started

### Frontend
```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8003 --reload
```

### Docker (full stack)
```bash
docker-compose up
# PostgreSQL :5432, Backend :8003, Frontend :3000
```

---

## What's Built

### Frontend — 22 Routes, 63 Components

**Client Questionnaire (`/will/*`) — 10 pages**

| Page | Route | What it does |
|------|-------|-------------|
| Landing | `/` | Magic link resolver (`?t=UUID`), resume progress banner |
| About You | `/will/about-you` | Legal name, DOB, address, province (4 sub-steps) |
| Your Family | `/will/your-family` | Marital status, spouse, children, guardians, pets |
| Your Estate | `/will/your-estate` | Gifts, donations, beneficiaries, distribution, trusts, Ontario clauses |
| Your Arrangements | `/will/your-arrangements` | Executor, backups, resting place, ceremony |
| POA Property | `/will/poa-property` | Attorney, effective date, restrictions |
| POA Personal Care | `/will/poa-personal-care` | Attorney, life support, organ donation |
| Assets | `/will/assets` | 12 asset types + 10 liability types + ownership + probate classification |
| Review | `/will/review` | Full review of all sections with Submit button |
| Submitted | `/will/submitted` | Bilingual thank-you with SLRA signing notice |

**Lawyer Dashboard (`/dashboard/*`) — 10 pages**

| Page | Route | What it does |
|------|-------|-------------|
| Login | `/dashboard/login` | Password auth ("Vaturi & Cho LLP" branding) |
| Overview | `/dashboard` | Stats cards (total clients, submitted, in progress), recent submissions table |
| Client List | `/dashboard/clients` | Filterable by status, progress bars, "New Client" button |
| New Client | `/dashboard/clients/new` | Create client + generate magic link with copy button |
| Client Detail | `/dashboard/clients/[id]` | Tabbed: Overview / Questionnaire / Documents / Tier 2. Estate overview, AI flags, "Send Review Link" button |
| Tier 2 Config | `/dashboard/clients/[id]/tier2` | Tiptap clause editor — tree sidebar + rich text editor panel |
| Design Sheet | `/dashboard/clients/[id]/design-sheet` | Will type, beneficiary %, trusts, executor chain, POA assignments |
| Documents | `/dashboard/clients/[id]/documents` | Generate/preview/download per document type |
| Settings | `/dashboard/settings` | Firm info, will defaults, notifications, branding, change password |

**Client Review Portal (`/review/*`) — 3 pages**

| Page | Route | What it does |
|------|-------|-------------|
| Review Landing | `/review` | Magic link resolver, document cards with status, progress bar |
| Document Review | `/review/[documentType]` | Clause-by-clause with "I understand" checkboxes, comments, annotations |
| Complete | `/review/complete` | Bilingual next steps, SLRA signing reminder |

**Components — 37 total**

| Category | Count | Components |
|----------|-------|-----------|
| UI primitives | 16 | button, card, input, select, badge, checkbox, dialog, label, progress, radio-group, separator, textarea, tooltip, date-picker |
| Will wizard | 7 | wizard-shell, step-header, step-navigation, person-form, percentage-allocator, language-toggle, ai-flag-banner |
| Dashboard | 7 | status-badge, ai-flags-summary, auth-guard, estate-overview, people-roles-grid, asset-summary, distribution-chart |
| Editor | 5 | clause-editor, clause-tree-item, editor-toolbar, rich-text-editor, placeholder-highlight |
| Providers | 4 | will-form-provider, draft-provider, i18n-provider, index (composed) |

**Data Layer**

| File | What it is |
|------|-----------|
| `lib/types/will.ts` | 20+ interfaces (WillDocument, PersonData, AssetData, LiabilityData, TrustData, etc.) |
| `types/will-document.ts` | WillClauseTemplate, SelectedWillClause, WillDocumentType, SigningPageData, AffidavitOfExecutionData |
| `lib/will-documents/clause-library.ts` | 60+ Ontario will clauses across 15 sections |
| `lib/will-documents/index.ts` | 8 document type configs, defaultClauseIds, helper functions |
| `lib/ai-flags.ts` | 9 Ontario-specific AI flagging rules |
| `lib/i18n/en.ts` + `ko.ts` | Full bilingual EN/KO dictionaries |
| `lib/api/drafts.ts` | API client — drafts, links, magic links, review links (with auth headers) |
| `lib/api/review.ts` | Review portal API — token resolution, preview, approve, comment |
| `lib/auth.ts` | Session management — login, logout, Bearer token, getAuthHeaders() |
| `lib/storage.ts` | localStorage persistence |

### Backend — 35 API Routes, 7 Services

**API Routes**

| Route Group | Prefix | Endpoints | Auth |
|------------|--------|-----------|------|
| Health | `/`, `/ready` | 2 | No |
| Auth | `/api/auth` | login, change-password | No |
| Drafts | `/api/drafts` | CRUD + submit (5) | Bearer token |
| Magic Links | `/api/links` | create, resolve, revoke (3) | No (client-facing) |
| Clauses | `/api/drafts/{id}/clauses` | get-all, get, save, reset (4) | Bearer token |
| Document Config | `/api/drafts/{id}/documents` | list, update (2) | Bearer token |
| Document Generation | `/api/documents` | generate, generate-all, preview, list (4) | Bearer token (preview: no) |
| Review | `/api/review` | token-resolve, status, preview, approve, comment, create-link (6) | No (client-facing) |
| Export | `/api/export` | assets CSV, liabilities CSV, estate summary CSV (3) | Bearer token |
| Agent | `/agents/will/invoke` | 4 capabilities (draft_will, get_draft_status, run_ai_flags, quick_draft) | No (internal) |
| OpenAPI | `/docs`, `/redoc`, `/openapi.json` | 3 | No |

**Services**

| Service | File | Description |
|---------|------|-------------|
| Database | `services/db.py` | EWDbWriter — 37 methods, tenant-aware, connection pool, all ew_* table CRUD |
| Document Generator | `services/document_generator.py` | python-docx — cover pages, numbered clauses, table-based signing pages, Schedule A, page footers |
| PDF Converter | `services/pdf_converter.py` | LibreOffice headless (graceful degradation) |
| Draft Service | `services/draft_service.py` | get_full_draft() |
| Link Service | `services/link_service.py` | Magic link generation |
| Notification Service | `services/notification_service.py` | SendGrid / stdout email on submission |

**Database Migrations**

| Migration | Tables |
|-----------|--------|
| 25 | `ew_will_drafts`, `ew_people`, `ew_assets`, `ew_ai_flags`, `ew_client_links`, `ew_design_sheets`, `ew_trusts`, `ew_signing_events`, `ew_document_generations` + `ix_cross_client_map` amendment |
| 26 | `ew_clause_selections`, `ew_document_configs` |
| 27 | `ew_review_approvals`, `ew_review_comments`, `ew_liabilities` + draft liabilities JSONB column |

### Clause Library — 60+ Clauses, 15 Sections

Based on Law Society of Ontario Annotated Will 2026 (199 pages) + firm precedent (Kim/Lee dual will package).

| Section | Clauses | Key Content |
|---------|---------|------------|
| 1. Revocation | 3 | Single, probate, non-probate variants |
| 2. Interpretation | 10 | Spouse, children, issue/per stirpes, probate/non-probate assets, excluded property definition, corporation deeming, relationship, gender/number, trustee reference |
| 3. Appointment | 6 | Primary, backup, corporate trustee, compensation, decision-making, no-certificate (non-probate) |
| 4. Debts & Taxes | 4 | Standard payment, dual will debt allocation, order of abatement |
| 5. Specific Gifts | 4 | Item, cash, charity (cy-pres), pet |
| 6. Residue | 4 | Spouse, children per stirpes, common disaster, 30-day survival |
| 7. FLA Exclusion | 1 | s.4(2)(2) — critical for every Ontario Will |
| 8. Trusts | 3 | Minor children's trust, Henson Trust (ODSP), Testamentary Spousal Trust |
| 9. GRE | 1 | Graduated Rate Estate maintenance (36-month, anti-tainting) |
| 10. Guardian | 1 | CLRA s.61 with 90-day expiry note |
| 11. Trustee Powers | 12 | Prudent investor, distribution in kind, borrowing (GRE-safe), combine trusts, RESP, minor payment, realization, real property, lending/guarantees, elections, exoneration, gradual liquidation |
| 12. Testimonium | 2 | In-person (SLRA s.4), remote video (SLRA s.21.1) |
| 13. Affidavit | 3 | Standard, probate will, non-probate will |
| 14. POA Property | 4 | Appointment, effective date, compensation (SDA s.38), restrictions |
| 15. POA Personal Care | 3 | Appointment, health care wishes, organ donation |

### AI Flagging Engine — 9 Ontario Rules

| Rule | Statute | Severity |
|------|---------|----------|
| FLA exclusion missing | FLA s.4(2)(2) | Critical |
| Henson Trust needed for ODSP beneficiary | ODSPA | Critical |
| Separation voids spouse gifts (3+ years) | SLRA s.17 | Warning |
| Dual will recommended (business assets) | EAT Act | Warning |
| RESP successor subscriber needed | ITA s.146.1 | Warning |
| Saunders v. Vautier trust risk | Case law | Warning |
| US person tax complications | ITA/IRS | Warning |
| Guardian 90-day expiry notice | CLRA s.61 | Info |
| Pecore resulting trust (joint non-spouse) | Case law | Info |

### Document Types — 8 Supported

| Type | Tier | Description |
|------|------|------------|
| Single Will | 1 | Standard last will covering all assets |
| Probate Will | 2 | Primary will for probate assets (dual will) |
| Non-Probate Will | 2 | Secondary will for non-probate assets (EAT savings) |
| POA Property | 1 | Continuing Power of Attorney for Property |
| POA Personal Care | 1 | Power of Attorney for Personal Care |
| Affidavit of Execution | 1 | Standard witness affidavit |
| Affidavit — Probate Will | 2 | Affidavit referencing dual will structure |
| Affidavit — Non-Probate Will | 2 | Affidavit kept on file (not submitted to court) |

### Tests — 155+

| Suite | Tests | Status |
|-------|-------|--------|
| Frontend — clause library integrity | 10 | Pass |
| Frontend — will-documents index helpers | 17 | Pass |
| Frontend — AI flagging engine | 16 | Pass |
| Frontend — bilingual i18n coverage | 8 | Pass |
| Backend — Pydantic models | 35 | Pass |
| Backend — route structure | 29 | Pass |
| Backend — quick_draft AI logic | 36 | Pass |
| Backend — DOCX generation E2E | 4 docs verified | Pass |

### Infrastructure

- `docker-compose.yml` — PostgreSQL 16 + backend + frontend
- `backend/Dockerfile` — Python 3.12-slim + uvicorn
- `frontend/Dockerfile` — Node 22-alpine + Next.js build
- `.env.example` — all required environment variables

---

## Pending — What's Not Done Yet

### Must Do (app doesn't work E2E without these)

| # | Task | Description |
|---|------|-------------|
| 1 | **Run PostgreSQL + apply migrations** | Migrations 25-27 exist but haven't been executed. Need to create `firm_demo` schema and run all 3 migrations. |
| 2 | **End-to-end flow test** | Create client via dashboard, send magic link, fill questionnaire, submit, lawyer reviews. Never tested against a real database. |
| 3 | **WillFormProvider reducer** | Verify `ADD_LIABILITY`/`REMOVE_LIABILITY` actions are handled in the reducer (types exist, UI dispatches them). |
| 4 | **Draft sync for liabilities** | The `use-draft-sync.ts` hook needs to include liabilities in the payload sent to server. |

### Nice to Have (polish)

| # | Task | Description |
|---|------|-------------|
| 5 | Backend auth hardening | In-memory tokens don't survive server restart. Move to JWT or Redis. |
| 6 | Email notifications | SendGrid integration — send on submission, review completion. |
| 7 | PDF conversion | LibreOffice headless or alternative (wkhtmltopdf, WeasyPrint). |
| 8 | Mobile responsiveness | Audit all pages on mobile viewports. |
| 9 | Production deployment | Test Docker Compose end-to-end, configure HTTPS. |

### Strategic / Future (see [#42](https://github.com/jaecho1001/ezwill/issues/42))

- Life insurance analysis & optimization
- AI tax & estate optimization (EAT simulator, capital gains, PRE)
- Business succession planning (estate freeze, SHA analyzer)
- Client portal v2 (interactive estate map, "what if" scenarios)
- CaseLawVision agent orchestration ([#40](https://github.com/jaecho1001/ezwill/issues/40))

---

## Legal Foundation

Ontario statutes: SLRA, SDA, CLRA, FLA, Trustee Act, ITA, EAT Act, ODSPA, Accumulations Act, Trillium Gift of Life Network Act, Health Care Consent Act, Law Society Act

Key case law: Saunders v. Vautier [1841], Henson v. Henson, Re Milne Estate (2019 ONSC 579), Granovsky Estate v. Ontario (1998), Pecore v. Pecore, Pierce v. Oswald (2025 ONSC 5344), Mansour v. Girgis (2024 ONSC 1611), Laing Estate v. Hines

## Related Repos

- [caselawvision](https://github.com/jaecho1001/caselawvision) — Platform architecture bible
- [ai-reception](https://github.com/jaecho1001/ai-reception) — Bilingual AI receptionist (Twilio + OpenAI Realtime)

## License

Proprietary — Vaturi & Cho LLP
