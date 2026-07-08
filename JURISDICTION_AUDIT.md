# EZWill jurisdiction-hardcoding audit

_Ontario-only today; north star = config-driven multi-jurisdiction (every Canadian province + US state). Produced by a read-only multi-agent audit: **131 findings** across 6 areas (clauses, validation rules, signing/execution, docgen variables, frontend copy/i18n, constants). This is a map for future work — nothing here is changed yet._

**Area finding counts:** clauses (20), rules-validation (19), signing-execution (17), docgen-variables (19), frontend-copy-i18n (37), constants-config (19)

---

# EZWill Multi-Jurisdiction Readiness — Engineering Report

## 1. Executive summary

EZWill is deeply coupled to Ontario at every layer — persistence, API models, document generation, the legal-rules engine, and user-facing copy. Ontario is not a configurable value; it is the *implicit substrate*. The default clause library (`frontend/src/lib/will-documents/clause-library.ts`, ~1,223 lines) is transcribed verbatim from the Law Society of Ontario Annotated Will, with Ontario statutes (SLRA, FLA s.4(2)(2), SDA 1992, CLRA s.61), terminology ("Estate Trustee", "Certificate of Appointment of Estate Trustee"), and numeric rules (age 18, ODSP $40k, 90-day guardian, 3-year separation, ~1.5%/$50k EAT) baked directly into template text. The database column `ew_will_drafts.province` defaults to `'ON'` (`backend/db/migrations/25-ezwill-tables.sql:42`), the API model defaults `province: str = 'ON'` (`backend/models.py:13`), and every downstream consumer silently falls back to `"Ontario"`. The signing schema encodes SLRA's two-witness / LSO-licensee model as first-class columns. Adding a province today means editing DOCX-rendering Python, TypeScript types, DB schema, clause templates, the AI prompt, and bilingual copy — there is no seam to flip. The good news: the app already carries a `province` field end-to-end, so the plumbing to route on jurisdiction exists; it is just ignored everywhere except one `=== 'ON'` gate.

## 2. The jurisdiction seams

There are **six** places where jurisdiction logic concentrates. Each is where a per-jurisdiction abstraction must plug in.

### Seam A — Clause library & document body text
- **Hardcoded:** The entire `willClauseLibrary` array (`frontend/src/lib/will-documents/clause-library.ts:6` header cites the LSO Annotated Will) — every `templateText`, `annotation`, and `statute` field. Literal Ontario statute citations inside clause bodies (Trustee Act R.S.O. c.T.23 at `:328`; "applicable laws of Ontario" at `:443`; FLA s.4(2)(2) at `:631`; guardianship CLRA s.61 at `:764`; Henson/ODSP $40k at `:679`; "in the Province of Ontario" literal in affidavit bodies at `:1044/1060/1075`). Backend mirrors this in `backend/services/document_generator.py` (Schedule A "Certificate of Appointment of Estate Trustee" at `:1253`; POA titles at `:37`).
- **Risk:** A non-Ontario will would generate legally *wrong* documents citing inapplicable statutes — the highest-severity failure mode (silent legal incorrectness, not a crash).
- **Abstraction:** Per-jurisdiction clause store keyed by ISO code (`willClauses['CA-ON']`, `['US-NY']`), each clause carrying `{ statute, applicabilityFlag, templateText }`. The generator must never assume the ON set exists.

### Seam B — Legal-rules / validation engine
- **Hardcoded:** `frontend/src/lib/ai-flags.ts:14` — `FLAG_RULES` is a flat global array of Ontario rules (FLA exclusion gated `province === 'ON'` at `:23`; SLRA s.17 3-year separation as a literal `setFullYear(-3)` at `:44`; ODSP $40k; CLRA s.61). Age of majority hardcoded `< 18` in two duplicated `isMinor()` helpers (`applicable.ts:68`, `will-intake-script.ts:305`). EAT computed inline in `frontend/src/app/will/assets/page.tsx:262` and again in `backend/routes/export.py:246`.
- **Risk:** Every client gets Ontario advice regardless of province; a BC minor (majority 19) is misclassified; EAT is charged where no probate tax exists.
- **Abstraction:** A per-jurisdiction rules pack; each rule declares which jurisdiction codes it applies to. `runAIFlags` loads only the active jurisdiction's rules. Numeric constants (`ageOfMajority`, `separationVoidYears`, `probateFeeSchedule`, `disabilityAssetLimit`) come from the rules record.

### Seam C — Signing / execution rules & schema
- **Hardcoded:** `backend/db/migrations/25-ezwill-tables.sql:200-224` — `ew_signing_events` has exactly two witness slots, `witness{1,2}_is_lso` booleans, and `signing_method CHECK IN ('in_person','remote_video')` (SLRA s.4 / s.21.1). Mirrored in the type `frontend/src/types/will-document.ts:66` (fixed `witness1`/`witness2`, `isLSOLicensee`). Two-witness attestation and single POA witness block hardcoded in `document_generator.py:831/899/990`.
- **Risk:** Cannot represent holograph wills, notarial wills (QC), different witness counts, self-proving affidavits, or jurisdictions barring remote witnessing. The witness *count* is baked into the data model, not just copy.
- **Abstraction:** Rules record fields `{ willWitnessCount, poaWitnessCount, allowedExecutionMethods[], requiresLicensedWitness, allowsRemote, swearingOfficer }`. Normalize witnesses into a child table `ew_signing_event_witnesses` so count is data-driven; rename `is_lso` → generic `authorized_witness`.

### Seam D — Document governing-law, labels & province extraction
- **Hardcoded:** `document_generator.py:127` `_PROVINCE_RE` recognizes only 10 Canadian provinces (no territories, no US states) and normalizes toward "Ontario" at `:147`. Affidavit jurat literal `"in the Province of {province}"` and default `"Ontario"` (`:1032/1049/1104`), "MAKE OATH AND SAY", "A Commissioner for Taking Affidavits" (`:1146`), witness age "eighteen (18)" (`:1079`). Frontend mirror regex `vault-to-variables.ts:60`. Province fallback `"Ontario"` in `routes/documents.py:56` and `routes/review.py:135`.
- **Risk:** US addresses yield an empty jurisdiction; documents emit Canadian "Province of" / commissioner phrasing where "State of" / notary is required.
- **Abstraction:** Rules record `{ subnationalUnitLabel: 'Province'|'State', localityLabel, notarialOfficer, oathForm, probateGrantName }` + a shared jurisdiction lookup table replacing both regexes. A single `resolveJurisdiction(draft)` helper shared by `documents.py` and `review.py`; no `"Ontario"` string fallback.

### Seam E — Frontend jurisdiction picker, copy & i18n
- **Hardcoded:** `frontend/src/app/will/about-you/page.tsx:14` `PROVINCES` lists only 10 Canadian provinces (omits YT/NT/NU that the `Province` type already declares); `:146` a `province !== 'ON'` gate drives a "non-Ontario, unsupported" warning. SEO/marketing "Ontario Will Builder" (`layout.tsx:14`, `page.tsx:171/164/385`). Legal copy in `en.ts`/`ko.ts` (min-age SLRA s.8 at `en.ts:153`, EAT formula at `:355`, common-law 3-year at `:157`, ServiceOntario organ registry at `:281`). Step keyed literally `'ontario-clauses'` / "Ontario Protections" (`steps.ts:59`, `your-estate/page.tsx:35`).
- **Risk:** The picker cannot even *select* a US state; the copy asserts Ontario law to every user; bilingual `ko.ts` must be parameterized in lockstep.
- **Abstraction:** Drive the dropdown from a supported-jurisdictions registry (code + `supported`/`coming-soon` flag). Replace literals with i18n *templates* interpolating `{jurisdictionName}`, `{statuteName}`, `{witnessCount}` from the rules pack. Gate the warning on `!jurisdiction.supported`, not `=== 'ON'`.

### Seam F — Constants, defaults, enums & AI prompt
- **Hardcoded:** DB default `'ON'` (`migration 25:42`); model default `province: str = 'ON'` (`models.py:13`); `Province` union is Canada-only (`will.ts:2`); `AssetType` bakes RRSP/TFSA/RESP with no 401k/IRA/529 (`will.ts:6`); currency/locale `en-CA`/`CAD` in dashboard formatters (`asset-summary.tsx:44`, etc.); AI prompt `ONTARIO_DUAL_WILL_CONTEXT` / "Ontario estate planning AI assistant" with fixed statute list and ~1.5%/$50k EAT (`agents.py:20/30/41`); `ai_intake.py:179` "Ontario estate-planning app"; service description "Ontario Will Builder" (`main.py:30`).
- **Risk:** Ontario is the invisible default that leaks in wherever a value is missing; the AI actively biases clause selection toward Ontario.
- **Abstraction:** A single jurisdiction registry supplying default jurisdiction, display name, currency/locale, account-type taxonomy, and an injectable AI-prompt context block per code.

## 3. Proposed minimal design

One module, one shape, Ontario as the first (and initially only fully-populated) entry so nothing changes behaviorally on day one.

```ts
// frontend/src/lib/jurisdictions/registry.ts  (mirror: backend/services/jurisdictions.py)
export type JurisdictionCode = 'CA-ON' | 'CA-BC' | 'US-NY' | ...; // sourced, not hand-union'd everywhere

export interface JurisdictionRules {
  code: JurisdictionCode;
  country: 'CA' | 'US';
  displayName: string;              // "Ontario"
  supported: boolean;               // gates the warning banner (Seam E)
  // --- labels & terminology (Seam D) ---
  subnationalUnitLabel: 'Province' | 'State';
  localityLabel: 'City' | 'County';
  fiduciaryTitle: string;           // "Estate Trustee" | "Executor" | "Personal Representative"
  probateGrantName: string;         // "Certificate of Appointment of Estate Trustee"
  courtName: string;
  notarialOfficer: string;          // "Commissioner for Taking Affidavits" | "Notary Public"
  oathForm: 'oath' | 'affirmation';
  // --- numeric constants (Seam B) ---
  ageOfMajority: number;            // 18 (ON) | 19 (BC) | ...
  minTestatorAge: number;
  defaultTrustDistributionAge: number;
  survivalDays: number;
  commonLawYears: number;
  separationVoidYears?: number;     // undefined ⇒ rule does not exist
  disabilityAssetLimit?: number;    // ODSP $40k etc.
  probateFeeSchedule: { threshold: number; rate: number }[]; // [] ⇒ no probate tax
  // --- execution (Seam C) ---
  willWitnessCount: number;
  poaWitnessCount: number;
  allowsRemoteWitnessing: boolean;
  requiresLicensedWitness: boolean;
  beneficiaryCannotWitness: boolean;
  // --- locale/currency (Seam F) ---
  locale: string; currency: string; // 'en-CA' / 'CAD'
  // --- content pointers (Seams A, F) ---
  clauseSetId: string;              // → willClauses['CA-ON']
  aiPromptContext: string;          // statute list + strategy block injected into agents.py
  governingLawText: string;
}
```

**Where it plugs in:**
- **Clauses (A):** `clause-library.ts` becomes `willClauses: Record<JurisdictionCode, Clause[]>`; generator selects by `rules.clauseSetId`. Backend migration 28 seeds `template_text` per jurisdiction.
- **Rules (B):** `ai-flags.ts` `runAIFlags(will)` reads `registry[will.aboutYou.jurisdiction]` and filters rules by declared applicability. `isMinor(dob, rules.ageOfMajority)` — one shared helper.
- **Signing (C):** `ew_signing_events` witnesses → child table; `SigningPageData.witnesses: WitnessData[]` sized by `rules.willWitnessCount`.
- **Docgen (D):** one `resolveJurisdiction(draft) → JurisdictionRules` helper replaces the three `"Ontario"` fallbacks and both regexes; jurat renders `rules.subnationalUnitLabel`.
- **Copy (E):** dropdown maps `registry`; i18n strings become templates.
- **AI (F):** `agents.py` injects `rules.aiPromptContext` instead of `ONTARIO_DUAL_WILL_CONTEXT`.

The registry ships with `'CA-ON'` populated from today's literals, so P0 is a pure extraction.

## 4. Prioritized, phased plan

**P0 — Extract Ontario behind the interface, zero behavior change.** Create the registry with `CA-ON` only, filled from current literals. Route every hardcoded value through it: replace the three `province.get(..., "Ontario")` fallbacks (`documents.py:56`, `review.py:135`, `document_generator.py:1032`) and the two `isMinor` `< 18` helpers with registry reads; centralize `formatCurrency`/`formatDate`. Add a `resolveJurisdiction` helper and a shared province-lookup table replacing `_PROVINCE_RE` (`document_generator.py:127`) and its frontend mirror (`vault-to-variables.ts:60`). **Acceptance:** ON documents/flags byte-identical to today; snapshot tests unchanged. No new jurisdiction yet — this is the seam.

**P1 — Add a second Canadian jurisdiction to prove the seam (recommend BC).** Populate `CA-BC`: `ageOfMajority: 19`, no FLA-equivalent, different probate fee schedule, PWD (not ODSP) disability limit, "Executor" terminology, BC witness rules. Add BC clause set. Flip the `about-you/page.tsx:146` warning gate from `province !== 'ON'` to `!rules.supported`. Add BC to the picker. **Acceptance:** selecting BC yields BC-correct age gating, no FLA-exclusion flag, BC probate math, BC clause bodies — with zero code edits outside the registry + clause store. This validates the abstraction before scaling.

**P2 — US-state specifics.** Extend `JurisdictionCode` to `US-*`; add `country: 'US'` behaviors: `subnationalUnitLabel: 'State'`, `notarialOfficer: 'Notary Public'`, self-proving affidavit templates, "Letters Testamentary"/"Letters of Administration" grant names, IRA/401(k)/Roth/529 account types (extend `AssetType`, `will.ts:6`), USD/en-US locale, and `probateFeeSchedule: []` where none exists. Normalize the signing schema (child witness table; rename `is_lso`) since US self-proving affidavits and variable witness counts break the two-slot model. Rename the DB `province` column / `Province` type to `jurisdiction_code` (`will.ts:2`, `db.py:97`, `migration 25:42`).

## 5. Highest-value individual findings (file:line → fix)

| # | File:line | What's hardcoded | Fix |
|---|---|---|---|
| 1 | `frontend/src/lib/will-documents/clause-library.ts:6` | Entire clause library = LSO Annotated Will (Ontario statutes/terms in every clause) | Split into `willClauses[JurisdictionCode]`; generator selects by `rules.clauseSetId` |
| 2 | `frontend/src/lib/ai-flags.ts:14` (gate at `:23`, `-3` at `:44`) | `FLAG_RULES` global Ontario array; FLA gated `=== 'ON'`; SLRA s.17 3-yr literal | Per-jurisdiction rule pack; rules declare applicable codes; thresholds from registry |
| 3 | `backend/db/migrations/25-ezwill-tables.sql:42` | `province TEXT NOT NULL DEFAULT 'ON'` | Drop default; add `jurisdiction_code` referencing jurisdictions table |
| 4 | `backend/db/migrations/25-ezwill-tables.sql:200-224` | `ew_signing_events`: 2 witness slots, `witness*_is_lso`, `signing_method` CHECK | Child witness table; enum from rules; rename `is_lso` → `authorized_witness` |
| 5 | `backend/models.py:13` | `province: str = 'ON'` API default | Require jurisdiction or default from firm config; validate against registry |
| 6 | `backend/services/document_generator.py:127` | `_PROVINCE_RE` Canada-only, normalizes to "Ontario" (`:147`) | Shared jurisdiction lookup table (provinces + territories + US states) |
| 7 | `backend/services/document_generator.py:1032` | Affidavit `province` fallback `"Ontario"` + "Province of"/"Commissioner" (`:1049/1146`) | `rules.subnationalUnitLabel` / `notarialOfficer`; no "Ontario" fallback |
| 8 | `backend/routes/agents.py:20/30` | AI prompt "Ontario estate planning AI assistant" + ~1.5%/$50k EAT | Inject `rules.aiPromptContext` (statutes, rates, strategy) per jurisdiction |
| 9 | `frontend/src/app/will/about-you/page.tsx:14` & `:146` | 10-province `PROVINCES` list; `province !== 'ON'` warning gate | Render from supported-jurisdictions registry; gate on `!rules.supported` |
| 10 | `frontend/src/app/will/assets/page.tsx:262` + `backend/routes/export.py:246` | Ontario EAT formula ($5/$15 per $1000, $50k) in two places | Single `probateFeeSchedule` in registry; jurisdictions w/o tax return 0 |
| 11 | `frontend/src/lib/will-documents/applicable.ts:68` + `will-intake-script.ts:305` | Age of majority `< 18` duplicated | One `isMinor(dob, rules.ageOfMajority)` helper |
| 12 | `frontend/src/lib/types/will.ts:2` | `Province` union Canada-only | Rename to `JurisdictionCode`; source from registry incl. US states |

*Note on an inconsistency to fix during P0:* default trust-distribution age is **21** in `backend/routes/review.py:154` but **25** in the frontend — the registry must reconcile these to a single per-jurisdiction value.

## Top priorities

1. P0: Build the jurisdiction registry (frontend/src/lib/jurisdictions/registry.ts + backend mirror) populated with CA-ON only from today's literals, and route the three "Ontario" fallbacks (documents.py:56, review.py:135, document_generator.py:1032) plus both isMinor <18 helpers (applicable.ts:68, will-intake-script.ts:305) through it with zero behavior change.
2. P0: Replace the two Canada-only province regexes (document_generator.py:127, vault-to-variables.ts:60) with one shared jurisdiction lookup table and a single resolveJurisdiction(draft) helper; drop the DB DEFAULT 'ON' (migration 25:42) and model default (models.py:13) in favor of registry-resolved jurisdiction.
3. P1: Prove the seam by adding CA-BC (ageOfMajority 19, no FLA rule, BC probate schedule, 'Executor' terminology) to the registry + a BC clause set, and flip the about-you:146 warning gate from province !== 'ON' to !rules.supported — validating that a new jurisdiction needs no edits outside the registry/clause store.
4. Refactor the two concentration points that block everything else: ai-flags.ts:14 FLAG_RULES into a per-jurisdiction rule pack, and the ew_signing_events schema (migration 25:200-224) two-witness/is_lso model into a data-driven child witness table sized by rules.willWitnessCount.
5. P2: Add US-state support (subnationalUnitLabel 'State', Notary Public, self-proving affidavits, Letters Testamentary, IRA/401k/529 in AssetType will.ts:6, USD/en-US) and rename the province column/type to jurisdiction_code across will.ts:2, db.py:97, migration 25:42.

