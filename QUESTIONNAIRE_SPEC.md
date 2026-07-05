# EZWill — Questionnaire & Data-Model Specification

**Purpose:** ground-truth reference for building UI/UX mockups that match the real EZWill Ontario will questionnaire — exact question flow, field names, enum values, and conditional logic. Extracted directly from the production codebase (Next.js frontend), not generic placeholders.

## Overview

EZWill is a single-firm Ontario will & estate-planning platform. There are **two parallel intake experiences**, both writing structured data that assembles into generated documents (wills, POAs, affidavits):

1. **Step Wizard** (`/will/*`) — a classic 7-step form (About You → Family → Estate → Arrangements → POA Property → POA Personal Care → Assets → Review). Data model: `WillDocument`. This is the current homepage entry point.
2. **Conversational Intake** (`/intake/[willId]`) — a guided chapter-based flow (also has a chat mode). Data model: `WillVault`. Reached from the summary/facts panels.

**Key product rules for the UI:**
- **Bilingual EN / 한국어**, but *only the questionnaire questions* are translated — generated legal documents (will, POAs, affidavits) always render in **English**.
- Ontario-specific defaults are baked in (province ON, per-stirpes residue, minor-trust age 25, FLA exclusion on, POA effective-immediately).
- A lawyer later edits the assembled clauses in a TipTap clause editor (`/dashboard/clients/[id]/tier2`) before generating the `.docx`.

---

## Data Model

The EZWill Ontario questionnaire is backed by **two distinct data models**:

- **`WillDocument`** (`frontend/src/lib/types/will.ts`) — the **step-wizard** shape: a flat, fully-typed document with named sections (About You, Your Family, Your Estate, Your Arrangements, POA Property, POA Personal Care) plus asset/liability/AI-flag arrays and wizard progress cursors.
- **`WillVault`** (`frontend/src/types/will-vault.ts`) — the **conversational-intake** shape: a normalized "vault" of facts written by the chat intake, read by the clause editor / applicability engine / review page and projected to `{{placeholder}}` variables.

### Enum / union types (`will.ts`)

```typescript
export type Province = 'ON' | 'BC' | 'AB' | 'QC' | 'MB' | 'SK' | 'NS' | 'NB' | 'NL' | 'PE' | 'YT' | 'NT' | 'NU'
export type Language = 'en' | 'ko'
export type MaritalStatus = 'single' | 'married' | 'commonlaw' | 'separated' | 'divorced' | 'widowed'
export type PersonRole = 'spouse' | 'child' | 'beneficiary' | 'executor' | 'guardian' | 'attorney_property' | 'attorney_care' | 'trustee' | 'contingent_beneficiary'
export type AssetType = 'real_estate' | 'bank' | 'investment' | 'rrsp' | 'tfsa' | 'insurance' | 'vehicle' | 'business' | 'digital' | 'personal_property' | 'resp' | 'pension'
export type LiabilityType = 'mortgage' | 'home_equity_line' | 'car_loan' | 'student_loan' | 'personal_loan' | 'credit_card' | 'line_of_credit' | 'tax_owing' | 'business_loan' | 'other_debt'
export type OwnershipType = 'sole' | 'joint_spouse' | 'joint_other' | 'tenants_in_common'
export type TrustType = 'childrens' | 'spousal' | 'henson' | 'gre'
export type RestingPlace = 'burial' | 'cremation' | 'donation' | 'not_specified'
export type AIFlagSeverity = 'critical' | 'warning' | 'info'
```

Inline union types used inside interfaces:

| Field | Location | Literal values |
|---|---|---|
| `residueDistribution` | `YourEstate` | `'equal_children' \| 'equal_beneficiaries' \| 'custom' \| 'per_stirpes'` |
| `GiftData.type` | `GiftData` | `'specific_item' \| 'cash' \| 'real_estate' \| 'charity' \| 'pet'` |
| `AssetData.probateClassification` | `AssetData` | `'probate' \| 'non_probate' \| 'unclassified'` |
| `POAPersonalCare.lifeSupport` | `POAPersonalCare` | `'maintain' \| 'withhold' \| 'attorney_decides'` |

### `PersonData`

```typescript
export interface PersonData {
  id: string
  role: PersonRole
  firstName: string
  lastName: string
  relationship?: string
  email?: string
  phone?: string
  address?: string
  isMinor?: boolean
  birthDate?: string
  receivesODSP?: boolean
  isUSPerson?: boolean
  percentage?: number // for beneficiaries
}
```

### Section interfaces (`will.ts`)

```typescript
export interface AboutYou {
  legalFirstName: string
  legalLastName: string
  preferredName?: string
  dateOfBirth?: string
  province: Province
  city: string
  email?: string
  phone?: string
}

export interface YourFamily {
  maritalStatus: MaritalStatus
  separationDate?: string // SLRA s.17 — separation 3+ years voids gifts
  hasSpouse: boolean
  spouse?: PersonData
  hasChildren: boolean
  children: PersonData[]
  hasGuardians: boolean
  guardians: PersonData[]
  hasPets: boolean
  pets: Array<{ id: string; name: string; type: string; caregiverName: string }>
}

export interface YourEstate {
  hasSpecificGifts: boolean
  gifts: GiftData[]
  hasDonations: boolean
  donations: GiftData[]
  beneficiaries: PersonData[]
  contingentBeneficiaries: PersonData[]
  residueDistribution: 'equal_children' | 'equal_beneficiaries' | 'custom' | 'per_stirpes'
  minorTrustAge: number // default 25 in Ontario
  hasTrusts: boolean
  trusts: TrustData[]
  includeFLAExclusion: boolean // FLA s.4(2)(2) — ALWAYS true in Ontario
  includeGREClause: boolean
  includeDualWill: boolean // Multiple Wills strategy
}

export interface YourArrangements {
  primaryExecutor?: PersonData
  backupExecutors: PersonData[]
  hasNoSurvivingExecutor: string // trustee company name
  restingPlace: RestingPlace
  ceremonyWishes?: string
  organDonation?: boolean
  funeralDirectiveLocation?: string
}

export interface POAProperty {
  hasAttorney: boolean
  attorney?: PersonData
  backupAttorney?: PersonData
  effectiveImmediately: boolean // vs springing (mental incapacity)
  restrictions?: string
  compensation?: string
  disputeResolution?: string
}

export interface POAPersonalCare {
  hasAttorney: boolean
  attorney?: PersonData
  backupAttorney?: PersonData
  lifeSupport?: 'maintain' | 'withhold' | 'attorney_decides'
  painPref?: string
  careInstructions?: string
  organDonation?: boolean
}
```

### Supporting record interfaces (`will.ts`)

```typescript
export interface GiftData {
  id: string
  type: 'specific_item' | 'cash' | 'real_estate' | 'charity' | 'pet'
  description: string
  recipientId?: string
  charityName?: string
  charityNumber?: string
  specificProgram?: string
  cyPresAlternative?: string
  amount?: number
  condition?: string
}

export interface AssetData {
  id: string
  assetType: AssetType
  description: string
  estimatedValue?: number
  address?: string
  accountNumber?: string
  institution?: string
  beneficiaryDesignation?: boolean
  jointOwnerName?: string
  jointOwnerRelationship?: string
  isRESP?: boolean
  ownershipType?: OwnershipType
  designatedBeneficiaryName?: string
  probateClassification?: 'probate' | 'non_probate' | 'unclassified'
  notes?: string
  policyNumber?: string
  maturityDate?: string
}

export interface LiabilityData {
  id: string
  liabilityType: LiabilityType
  description: string
  creditor?: string
  outstandingBalance?: number
  monthlyPayment?: number
  ownershipType?: OwnershipType
  jointOwnerName?: string
  securedByAssetId?: string
  notes?: string
}

export interface TrustData {
  id: string
  trustType: TrustType
  beneficiaryIds: string[]
  trusteeIds: string[]
  distributionAge?: number
  perStirpesLanguage?: boolean
  absoluteDiscretion?: boolean
  qdtElection?: boolean
  maxVoluntaryPayment?: number
}

export interface AIFlag {
  id: string
  severity: AIFlagSeverity
  title: string
  titleKo?: string
  description: string
  descriptionKo?: string
  statute?: string
  learnMoreUrl?: string
  dismissed: boolean
}
```

### Root document (`will.ts`)

```typescript
export interface WillDocument {
  id: string
  createdAt: string
  updatedAt: string
  language: Language
  currentStep: number
  currentSubStep: number
  completedSteps: number[]
  aboutYou: AboutYou
  yourFamily: YourFamily
  yourEstate: YourEstate
  yourArrangements: YourArrangements
  poaProperty: POAProperty
  poaPersonalCare: POAPersonalCare
  assets: AssetData[]
  liabilities: LiabilityData[]
  aiFlags: AIFlag[]
}
```

### Default seed — `INITIAL_WILL` (`will.ts`)

Notable Ontario defaults baked into the initial document:

| Field | Default value |
|---|---|
| `language` | `'en'` |
| `currentStep` / `currentSubStep` | `0` / `0` |
| `aboutYou.province` | `'ON'` |
| `yourFamily.maritalStatus` | `'single'` |
| `yourEstate.residueDistribution` | `'per_stirpes'` |
| `yourEstate.minorTrustAge` | `25` |
| `yourEstate.includeFLAExclusion` | `true` |
| `yourEstate.includeGREClause` | `true` |
| `yourEstate.includeDualWill` | `false` |
| `yourArrangements.restingPlace` | `'not_specified'` |
| `poaProperty.effectiveImmediately` | `true` |
| `poaProperty.hasAttorney` / `poaPersonalCare.hasAttorney` | `false` |

```typescript
export const INITIAL_WILL: WillDocument = {
  id: '',
  createdAt: '',
  updatedAt: '',
  language: 'en',
  currentStep: 0,
  currentSubStep: 0,
  completedSteps: [],
  aboutYou: {
    legalFirstName: '',
    legalLastName: '',
    province: 'ON',
    city: '',
  },
  yourFamily: {
    maritalStatus: 'single',
    hasSpouse: false,
    hasChildren: false,
    children: [],
    hasGuardians: false,
    guardians: [],
    hasPets: false,
    pets: [],
  },
  yourEstate: {
    hasSpecificGifts: false,
    gifts: [],
    hasDonations: false,
    donations: [],
    beneficiaries: [],
    contingentBeneficiaries: [],
    residueDistribution: 'per_stirpes',
    minorTrustAge: 25,
    hasTrusts: false,
    trusts: [],
    includeFLAExclusion: true,
    includeGREClause: true,
    includeDualWill: false,
  },
  yourArrangements: {
    backupExecutors: [],
    hasNoSurvivingExecutor: '',
    restingPlace: 'not_specified',
  },
  poaProperty: {
    hasAttorney: false,
    effectiveImmediately: true,
    backupAttorney: undefined,
  },
  poaPersonalCare: {
    hasAttorney: false,
  },
  assets: [],
  liabilities: [],
  aiFlags: [],
}
```

### Clause / document types (`will-document.ts`)

```typescript
export type WillDocumentType =
  | 'simple_will_short'      // Short-form Tier 1 simple will
  | 'single_will'            // Tier 1 simple will
  | 'probate_will'           // Dual will — primary/probate
  | 'non_probate_will'       // Dual will — secondary/private
  | 'poa_property'           // Continuing POA for Property
  | 'poa_personal_care'      // POA for Personal Care
  | 'affidavit_execution'    // Affidavit of Execution
  | 'affidavit_execution_probate'    // Affidavit of Execution (probate will)
  | 'affidavit_execution_non_probate' // Affidavit of Execution (non-probate will)

export interface WillClauseTemplate {
  id: string
  section: string
  subsection?: string
  name: string
  parentId?: string
  sortOrder: number
  isFolder: boolean
  templateText: string           // with {{placeholder}} variables
  annotation?: string            // plain-language explanation for the lawyer
  annotationKo?: string          // Korean annotation
  statute?: string               // e.g. "SLRA s.4", "FLA s.4(2)(2)"
  caselaw?: string               // e.g. "Pecore v. Pecore [2007] 1 SCR 795"
  applicableWhen?: Record<string, unknown>  // condition to auto-include
  tier: 1 | 2                    // which tier includes this clause
  children?: WillClauseTemplate[]
  documentType: WillDocumentType | 'all'  // which document this clause belongs to
}

export interface SelectedWillClause {
  clauseId: string
  section: string
  subsection?: string
  included: boolean
  customText?: string            // lawyer's edited version (overrides template)
  aiGenerated: boolean
  sortOrder: number
}

export interface WillDocumentTypeConfig {
  id: WillDocumentType
  name: string
  shortName: string
  description: string
  icon: string
  tier: 1 | 2
  defaultClauseIds: string[]
}

export interface SigningPageData {
  testatorName: string
  dateOfSigning?: string
  location?: string
  signingMethod: 'in_person' | 'remote_video'  // SLRA s.4 or s.21.1
  witness1: WitnessData
  witness2: WitnessData
  remotePlatform?: string       // Zoom, Teams, etc.
  lsoWitnessIndex?: 1 | 2      // which witness is the LSO licensee
}

export interface WitnessData {
  name: string
  address: string
  occupation?: string
  isLSOLicensee?: boolean       // required for remote video execution
  lsoNumber?: string
}

export interface AffidavitOfExecutionData {
  type: 'simple' | 'probate' | 'non_probate'
  deponentName: string          // the witness making the affidavit
  deponentAddress: string
  deponentOccupation?: string
  testatorName: string
  dateOfWill: string
  dateOfAffidavit?: string
  commissionerName?: string
  commissionerExpiry?: string
  isRemote: boolean             // For remote (O.Reg 431/20)
  remotePlatform?: string
}
```

### Conversational-intake shape — `WillVault` (`will-vault.ts`)

Note: `will-vault.ts` declares its **own** `MaritalStatus` union, which differs from the one in `will.ts` (`'common_law'` with underscore vs `'commonlaw'`; no `'separated'`).

```typescript
export type MaritalStatus = 'married' | 'common_law' | 'single' | 'divorced' | 'widowed'

export interface VaultTestator {
  fullName?: string
  dob?: string // ISO date
  address?: string
  maritalStatus?: MaritalStatus
  occupation?: string
  citizenship?: string
}

export interface VaultSpouse {
  fullName?: string
  included?: boolean
  dob?: string
}

export interface VaultChild {
  id: string
  fullName: string
  dob?: string
  fromPriorRelationship?: boolean
  isDependent?: boolean
}

export interface VaultPerson {
  id: string
  fullName: string
  relationship?: string
  address?: string
  isBackup?: boolean
}

export interface VaultBeneficiary extends VaultPerson {
  sharePercent?: number
  specificGift?: string
}

export interface VaultAssets {
  realEstate?: string[]
  privateCompanyShares?: boolean
  shareholderLoans?: boolean
  lifeInsurance?: boolean
  rrspBeneficiaries?: string
  estimatedNetWorth?: number
}

export interface VaultGoals {
  hasDualWill?: boolean
  hasPoaProperty?: boolean
  hasPoaPersonalCare?: boolean
  charitableGiving?: boolean
  henson?: boolean
  minorChildrenTrust?: boolean
  spousalTrust?: boolean
}

export interface WillVault {
  testator: VaultTestator
  spouse?: VaultSpouse
  children: VaultChild[]
  executors: VaultPerson[]
  guardians: VaultPerson[]
  beneficiaries: VaultBeneficiary[]
  assets: VaultAssets
  goals: VaultGoals
}

/** Dot-path into the vault, e.g. "testator.fullName" or "children.0.fullName". */
export type VaultPath = string

export const emptyVault: WillVault = {
  testator: {},
  children: [],
  executors: [],
  guardians: [],
  beneficiaries: [],
  assets: {},
  goals: {},
}
```

**Model difference (one line):** `WillDocument` is the **step-wizard** model — a flat, fully-typed document driven by `currentStep`/`completedSteps` progress cursors; `WillVault` is the **conversational-intake** model — a loosely-typed, mostly-optional "vault" of facts the chat fills in incrementally and projects to `{{placeholder}}` variables.

---

## Step Wizard Flow (/will/*)

Source of truth: `frontend/src/lib/constants/steps.ts` (`WILL_STEPS`) plus each page under `frontend/src/app/will/*/page.tsx`. All display labels are i18n keys (`t.*`) resolved by `useTranslation()`; values/enum members below are the literal code values. Every step page renders `<AIFlagBanner />` at top and a shared `<StepNavigation>` footer (Back / Continue, optional Skip). State is held in `will.*` via `useWillForm()` and mutated through `dispatch({ type: 'UPDATE_*' })`.

### Step order + routing

| # | key | path | Continue → | Back → | COMPLETE_STEP payload |
|---|---|---|---|---|---|
| 1 | about-you | `/will/about-you` | `/will/your-family` | `/` (from subStep 0) | 1 |
| 2 | your-family | `/will/your-family` | `/will/your-estate` | `/will/about-you` | 2 |
| 3 | your-estate | `/will/your-estate` | `/will/your-arrangements` | `/will/your-family` | 3 |
| 4 | your-arrangements | `/will/your-arrangements` | `/will/poa-property` | `/will/your-estate` | 4 |
| 5 | poa-property | `/will/poa-property` | `/will/poa-personal-care` | `/will/your-arrangements` | 5 |
| 6 | poa-personal-care | `/will/poa-personal-care` | `/will/assets` | `/will/poa-property` | 6 |
| 7 | assets | `/will/assets` | `/will/review` | `/will/poa-personal-care` | 7 |
| — | review | `/will/review` | `/will/submitted` (on submit) | — (per-section "Edit" deep links) | — |

Within a step, Back at subStep 0 routes to the previous step's page (as above); otherwise it decrements the sub-step. Continue on the last sub-step dispatches `COMPLETE_STEP` and pushes the next page.

`PersonForm` (used for spouse/child/guardian/beneficiary/executor/attorney) renders: `firstName` (text, required-shaped), `lastName` (text), and optionally `relationship` (text, `showRelationship`), `email` (email, `showEmail`), `phone` (tel, `showPhone`), `address` (text, `showAddress`). Fields write onto the target `PersonData` object.

---

### Step 1 — About You (`icon: 👤`)

`SUB_STEPS = ['legal-name', 'dob', 'location', 'contact']` (static). `totalSteps = 4`. `data = will.aboutYou`.

| subStep | id | fields | input type | data path |
|---|---|---|---|---|
| 0 | legal-name | `legalFirstName` (autoFocus), `legalLastName`, `preferredName` | text | `aboutYou.legalFirstName`, `aboutYou.legalLastName`, `aboutYou.preferredName` |
| 1 | dob | `dateOfBirth` | DatePicker (`maxYear = currentYear − 18`, `minYear = 1920`) | `aboutYou.dateOfBirth` |
| 2 | location | `province`, `city` | select / text | `aboutYou.province`, `aboutYou.city` |
| 3 | contact | `email`, `phone` | email / tel | `aboutYou.email`, `aboutYou.phone` |

Province select options (value → label):
```
ON → Ontario           BC → British Columbia   AB → Alberta
QC → Quebec            MB → Manitoba           SK → Saskatchewan
NS → Nova Scotia       NB → New Brunswick      NL → Newfoundland & Labrador
PE → Prince Edward Island
```

Conditional rendering:
- subStep 1: after a date is set, shows `✓ t.about_ageConfirmNote`.
- subStep 2: if `province !== 'ON'`, shows amber warning `t.about_nonOntarioWarning`.

Continue-gating (`isCurrentValid`):
```
subStep 0 → legalFirstName.trim() && legalLastName.trim()
subStep 1 → !!dateOfBirth
subStep 2 → province && city.trim()
subStep 3 → true
```
Skip: `showSkip = subStep === 3` (contact) → dispatch COMPLETE_STEP 1, push `/will/your-family`.

---

### Step 2 — Your Family (`icon: 👨‍👩‍👧‍👦`)

Sub-steps are **dynamic** (built in-page):
```js
subSteps = [
  'marital-status',
  ...(data.hasSpouse ? ['spouse'] : []),
  'children',
  ...(data.hasChildren ? ['guardians'] : []),
  'pets',
]
```
(steps.ts declares: spouse `dependsOn { yourFamily.hasSpouse === true }`, guardians `dependsOn { yourFamily.hasChildren === true }`.) `data = will.yourFamily`.

**marital-status** — RadioGroup (`columns=2`), writes `yourFamily.maritalStatus`; also derives `hasSpouse = ms === 'married' || ms === 'commonlaw'`:

| value | label key | icon | description |
|---|---|---|---|
| single | `t.maritalStatuses.single` | 🧑 | — |
| married | `t.maritalStatuses.married` | 💍 | — |
| commonlaw | `t.maritalStatuses.commonlaw` | 🤝 | `t.family_commonlawDesc` |
| separated | `t.maritalStatuses.separated` | ↔️ | `t.family_separatedDesc` |
| divorced | `t.maritalStatuses.divorced` | 📋 | — |
| widowed | `t.maritalStatuses.widowed` | 🕊️ | — |

Conditional: if `maritalStatus === 'separated'`, shows a `date` input → `yourFamily.separationDate` + note `t.family_separationNote`.

**spouse** (only if `hasSpouse`) — `PersonForm` with `showEmail showPhone` → `yourFamily.spouse` (role `spouse`).

**children** — RadioGroup yes/no (`columns=2`, 👶 / ✗) → `yourFamily.hasChildren` (setting `no` clears `children: []`). If yes: repeatable child cards, each a `PersonForm` → `yourFamily.children[]` (role `child`), plus two checkboxes per child: `isMinor` (`t.family_minorLabel`), `receivesODSP` (`t.family_odspLabel`). "Add Child" button (`t.addChild`).

**guardians** (only if `hasChildren`) — amber law note (`t.family_guardianLawTitle/Note`); repeatable guardian cards, `PersonForm` with `showRelationship showEmail` → `yourFamily.guardians[]` (role `guardian`); first labeled primary, rest backup. "Add Guardian" (`t.addGuardian`).

**pets** — RadioGroup yes/no (🐾 / ✗) → `yourFamily.hasPets` (no clears `pets: []`). If yes: repeatable pet cards with three text inputs → `pets[].name`, `pets[].type`, `pets[].caregiverName`. "Add Pet" (`t.addPet`).

Continue-gating: none — `<StepNavigation>` is rendered with **no** `continueDisabled`, so Continue is always enabled. No Skip button on any sub-step.

---

### Step 3 — Your Estate (`icon: 🏛️`)

`SUB_STEPS = ['specific-gifts', 'donations', 'beneficiaries', 'distribution', 'minor-trust', 'ontario-clauses']`. `data = will.yourEstate`.

**subStep 0 — specific-gifts:** RadioGroup yes/no (`hasGifts`, 🎁 / ✗ + `t.estate_giftsNoDesc`) → `yourEstate.hasSpecificGifts`. If yes: repeatable gift cards with two text inputs → `gifts[].description`, `gifts[].recipientId`. New gift object: `{ id, type:'specific_item', description:'', recipientId:'' }` → `yourEstate.gifts[]`. Add button `t.estate_addGift`.

**subStep 1 — donations:** RadioGroup yes/no (`hasDonations`, 🏥 / ✗) → `yourEstate.hasDonations`. If yes: repeatable charity cards with three inputs → `donations[].charityName`, `donations[].charityNumber`, `donations[].description`. New object `{ id, type:'charity', description:'' }` → `yourEstate.donations[]`. Add `t.estate_addCharity`.

**subStep 2 — beneficiaries:** repeatable `PersonForm` (`showRelationship`) → `yourEstate.beneficiaries[]` (role `beneficiary`, `percentage:0`), plus per-beneficiary checkboxes `receivesODSP` (`t.estate_receivesODSP`) and `isUSPerson` (`t.estate_usPerson`). Add `t.estate_addBeneficiary`.

**subStep 3 — distribution:** RadioGroup (`columns=1`) → `yourEstate.residueDistribution`:

| value | title key | description key |
|---|---|---|
| per_stirpes | `t.estate_perStirpesTitle` | `t.estate_perStirpesDesc` |
| equal_children | `t.estate_equalChildrenTitle` | `t.estate_equalChildrenDesc` |
| equal_beneficiaries | `t.estate_equalBeneficiariesTitle` | `t.estate_equalBeneficiariesDesc` |
| custom | `t.estate_customTitle` | `t.estate_customDesc` |

Conditional: if `residueDistribution === 'custom' && beneficiaries.length > 0`, renders `<PercentageAllocator people={beneficiaries}>` writing back `beneficiaries[].percentage`.

**subStep 4 — minor-trust:** Select → `yourEstate.minorTrustAge` (parsed int). Options: `18, 19, 21, 23, 25, 30, 35` (label `t.estate_age {age}`; age 25 appends `t.estate_recommendedSuffix`, age 18 appends `t.estate_ontarioDefaultSuffix`). Explainer box interpolates the chosen age.

**subStep 5 — ontario-clauses:** three checkbox cards:

| checkbox | data path | note |
|---|---|---|
| FLA exclusion | `yourEstate.includeFLAExclusion` | `t.estate_flaTitle` + red `t.estate_flaCriticalBadge`; green highlight when checked |
| GRE clause | `yourEstate.includeGREClause` | `t.estate_greTitle`; green when checked |
| Dual will | `yourEstate.includeDualWill` | `t.estate_dualWillTitle`; amber when checked |

(Defaults from `INITIAL_WILL`: `includeFLAExclusion=true`, `includeGREClause=true`, `includeDualWill=false`, `residueDistribution='per_stirpes'`, `minorTrustAge=25`.)

Continue-gating (`isCurrentValid`):
```
subStep 3 && (residueDistribution === 'custom' || 'equal_beneficiaries') → beneficiaries.length > 0
otherwise → true
```
Skip: `showSkip = subStep === 0 || subStep === 1` (specific-gifts, donations); `onSkip` just advances one sub-step.

---

### Step 4 — Your Arrangements (`icon: 📋`)

`SUB_STEPS = ['executor', 'backup-executors', 'resting-place', 'ceremony']`. `data = will.yourArrangements`.

| subStep | id | content | data path |
|---|---|---|---|
| 0 | executor | `PersonForm` (`showRelationship showEmail showPhone`, title `t.arr_primaryExecutor`) + amber tip | `yourArrangements.primaryExecutor` (role `executor`) |
| 1 | backup-executors | repeatable `PersonForm` (`showRelationship showEmail`), Add `t.arr_addBackupExecutor` | `yourArrangements.backupExecutors[]` |
| 2 | resting-place | RadioGroup (`columns=2`) | `yourArrangements.restingPlace` |
| 3 | ceremony | Textarea (min-h 120px) | `yourArrangements.ceremonyWishes` |

resting-place options:

| value | title key | icon |
|---|---|---|
| burial | `t.arr_burial` | ⚱️ |
| cremation | `t.arr_cremation` | 🕯️ |
| donation | `t.arr_bodyDonation` | 🔬 |
| not_specified | `t.arr_executorDiscretion` | 📋 |

Continue-gating: `isCurrentValid = subStep !== 0 || !!primaryExecutor?.firstName?.trim()` (executor first name required; all other sub-steps always valid).
Skip: `showSkip = subStep === 3` (ceremony) → dispatch COMPLETE_STEP 4, push `/will/poa-property`.

---

### Step 5 — Power of Attorney · Property (`icon: 🏠`)

`SUB_STEPS = ['attorney', 'effective', 'restrictions']`. `data = will.poaProperty`.

**subStep 0 — attorney:** primary `PersonForm` (`showRelationship showEmail showPhone`, title `t.poaProp_primaryAttorney`) → `poaProperty.attorney` (role `attorney_property`); **editing it also sets `hasAttorney: true`**. Below (border-top) an optional backup `PersonForm` (`showRelationship`) → `poaProperty.backupAttorney`. Blue SDA note box.

**subStep 1 — effective:** RadioGroup (`columns=1`) → `poaProperty.effectiveImmediately` (`immediate` → true, `incapacity` → false):

| value | title key | desc key |
|---|---|---|
| immediate | `t.poaProp_immediateTitle` | `t.poaProp_immediateDesc` |
| incapacity | `t.poaProp_incapacityTitle` | `t.poaProp_incapacityDesc` |

**subStep 2 — restrictions:** two Textareas → `poaProperty.restrictions`, `poaProperty.compensation`.

Continue-gating: `isCurrentValid = subStep !== 0 || !hasAttorney || !!attorney?.firstName?.trim()` (attorney first name required only once `hasAttorney` is true; never blocks a client who leaves it untouched).
Skip: `showSkip = subStep === 2` (restrictions) → dispatch COMPLETE_STEP 5, push `/will/poa-personal-care`.

---

### Step 6 — Power of Attorney · Personal Care (`icon: ❤️`)

`SUB_STEPS = ['attorney', 'wishes', 'organ-donation']`. `data = will.poaPersonalCare`.

**subStep 0 — attorney:** primary `PersonForm` (`showRelationship showEmail showPhone`, title `t.poaCare_primaryAttorney`) → `poaPersonalCare.attorney` (role `attorney_care`); editing sets `hasAttorney: true`. Optional backup `PersonForm` (`showRelationship`) → `poaPersonalCare.backupAttorney`.

**subStep 1 — wishes:** RadioGroup (`columns=1`, default `attorney_decides`) → `poaPersonalCare.lifeSupport`; plus Textarea → `poaPersonalCare.careInstructions`.

| value | title key | desc key |
|---|---|---|
| maintain | `t.poaCare_maintainTitle` | `t.poaCare_maintainDesc` |
| withhold | `t.poaCare_withholdTitle` | `t.poaCare_withholdDesc` |
| attorney_decides | `t.poaCare_attorneyDecidesTitle` | `t.poaCare_attorneyDecidesDesc` |

**subStep 2 — organ-donation:** RadioGroup (`columns=2`) → `poaPersonalCare.organDonation` (`yes` → true, `no` → false, `unspecified` → undefined):

| value | title key | icon |
|---|---|---|
| yes | `t.poaCare_donateYesTitle` | ❤️ (desc `t.poaCare_donateYesDesc`) |
| no | `t.poaCare_donateNoTitle` | ✗ |
| unspecified | `t.poaCare_donateFamilyTitle` | 👨‍👩‍👧‍👦 |

Continue-gating: `isCurrentValid = subStep !== 0 || !hasAttorney || !!attorney?.firstName?.trim()` (same pattern as Step 5).
Skip: `showSkip = subStep >= 1` (wishes + organ-donation); `onSkip` advances one sub-step, or on the last sub-step dispatches COMPLETE_STEP 6 and pushes `/will/assets`.

---

### Step 7 — Your Assets (`icon: 💰`)

**Not sub-step based** — a three-tab interface. `TabKey = 'assets' | 'liabilities' | 'summary'`. Data paths: `will.assets[]` and `will.liabilities[]` (mutated via `ADD_ASSET` / `UPDATE_ASSET` / `REMOVE_ASSET` and the LIABILITY equivalents). A summary bar above the tabs shows counts + net (`totalAssets − totalLiabilities`), an over-$1M amber note, and a high-debt red note when `totalLiabilities > totalAssets * 0.5`.

**Assets tab** — list of `AssetForm` cards + an "add" picker. Add flow: a Select of `selectedAssetType` then `+ Add` dispatches `ADD_ASSET { id, assetType, description:'' }`.

Asset type options (value → labelKey, icon):
```
real_estate→assets_typeRealEstate 🏠   bank→assets_typeBank 🏦
investment→assets_typeInvestment 📈     rrsp→assets_typeRrsp 🏛️
tfsa→assets_typeTfsa 💼                 insurance→assets_typeInsurance 🛡️
vehicle→assets_typeVehicle 🚗          business→assets_typeBusiness 🏢
resp→assets_typeResp 🎓                pension→assets_typePension 💰
digital→assets_typeDigital 💻          personal_property→assets_typePersonalProperty 📦
```

Per-asset fields (`AssetData`): `description` (text); conditional `address` (only `real_estate`); conditional `institution` + `accountNumber` (maxLength 4; only `bank/investment/rrsp/tfsa/resp`); conditional `policyNumber` (only `insurance`); `estimatedValue` (number, `$` prefix); `ownershipType` (Select, default `sole`); conditional `jointOwnerName` + `jointOwnerRelationship` (when ownership is `joint_spouse`/`joint_other`/`tenants_in_common`); checkbox `beneficiaryDesignation` which reveals `designatedBeneficiaryName`; `probateClassification` Select (`probate` / `non_probate` / `unclassified`, with tooltip); `notes` (Textarea).

Ownership options (assets): `sole`, `joint_spouse`, `joint_other`, `tenants_in_common` (labelKeys `assets_ownSole/…JointSpouse/…JointOther/…TenantsInCommon`).

**Liabilities tab** — list of `LiabilityForm` cards + add picker (`ADD_LIABILITY { id, liabilityType, description:'' }`).

Liability type options:
```
mortgage→assets_liabMortgage 🏠        home_equity_line→assets_liabHeloc 🏦
car_loan→assets_liabCarLoan 🚗         student_loan→assets_liabStudentLoan 🎓
personal_loan→assets_liabPersonalLoan 👤  credit_card→assets_liabCreditCard 💳
line_of_credit→assets_liabLineOfCredit 📋  tax_owing→assets_liabTaxOwing 🧾
business_loan→assets_liabBusinessLoan 💼   other_debt→assets_liabOtherDebt 📝
```

Per-liability fields (`LiabilityData`): `description`, `creditor`, `outstandingBalance` (number `$`), `monthlyPayment` (number `$`), `ownershipType` Select (only `sole` / `joint_spouse` / `joint_other`), conditional `jointOwnerName` (when joint), conditional `securedByAssetId` Select (only shown when `assets.length > 0`; `_none` sentinel → undefined), `notes`.

**Summary tab** (`SummaryTab`) — computed, read-only: Net Worth card (total assets / total liabilities / net worth); Assets-by-category and Liabilities-by-category breakdowns; Ontario Estate Administration Tax estimate `calculateEAT` = `0.5%` up to $50,000 then `1.5%` on the excess, applied to probate total (or total assets if none classified); over-$1M amber note; probate vs non-probate split with a visual bar.

Continue-gating: none. Continue label is `t.reviewWill`; on Continue (or the always-visible **Skip**) dispatch COMPLETE_STEP 7 and push `/will/review`.

---

### Review (`/will/review`)

Single page (no sub-steps). Reads `will` read-only; renders one `ReviewSection` per step with an "Edit" link (`t.review_edit`) deep-linking back to that step's page:

| Section | href | Fields shown (data source) |
|---|---|---|
| About You | `/will/about-you` | legal name (`aboutYou.legalFirstName + legalLastName`), `dateOfBirth`, `province`, `city`, `email` |
| Your Family | `/will/your-family` | `maritalStatus`; `spouse` name (if present); children names; guardians names (`t.review_none` fallback) |
| Your Estate | `/will/your-estate` | gifts count, donations (charity names), beneficiaries names, `residueDistribution`, `minorTrustAge`; badges: FLA exclusion (success), GRE clause (success), Dual will (warning) when set |
| Your Arrangements | `/will/your-arrangements` | `primaryExecutor` name, backup executor names, `restingPlace` |
| POA — Property | `/will/poa-property` | attorney name (`t.review_notDesignated` fallback), effective (`immediately` / `onIncapacity`) |
| POA — Personal Care | `/will/poa-personal-care` | attorney name, `lifeSupport`, organ donation (yes/no/not specified) |
| Assets | `/will/assets` | total count + first 5 assets (`assetType` + description/value), "+N more" |

Behavior:
- `criticalFlags = aiFlags.filter(f => !f.dismissed && f.severity === 'critical')`; if any, a red banner shows the count at top.
- `allStepsComplete = WILL_STEPS.every(s => completedSteps.includes(s.id))` (computed; used for wizard completeness).
- Primary button `t.review_submitToLawyer` → `handleSubmit()`: requires `draftId` (else error `t.review_errorNoQuestionnaire`); calls `submitDraft(draftId, token)`; on success pushes `/will/submitted`, on failure sets `t.review_errorSubmitFailed`. Shows spinner + `t.review_submitting` while pending. Secondary button `t.review_downloadSummaryPdf` (no handler wired). "What happens next" 4-step amber list + legal disclaimer.

---

## Conversational Intake Flow (`/intake`)

The intake is a declarative, chapter-based questionnaire defined in `will-intake-script.ts`. The UI renders one chapter at a time, writes each answer to the vault at a dot-path (`vaultPath`), and evaluates `skipIf` rules against the live vault so irrelevant questions (e.g. spouse questions for a single testator) are never shown. Every user-facing string has an English value plus an optional Korean sibling (`*Ko`), resolved at render time by the `L(language, en, ko)` helper.

### Type shapes

```ts
export type QuestionKind =
  | 'text'
  | 'textarea'
  | 'date'
  | 'select'
  | 'boolean'
  | 'number'
  | 'personList'
  | 'childList'

export interface IntakeQuestion {
  id: string
  vaultPath: VaultPath
  prompt: string
  promptKo?: string
  helpText?: string
  helpTextKo?: string
  kind: QuestionKind
  options?: Array<{ label: string; labelKo?: string; value: string }>
  required?: boolean
  skipIf?: (v: WillVault) => boolean
  validate?: (value: unknown) => string | null
  placeholder?: string
  placeholderKo?: string
}

export interface IntakeChapter {
  id: string
  title: string
  titleKo?: string
  icon: string
  intro: string
  introKo?: string
  questions: IntakeQuestion[]
}
```

### `kind` → UI control mapping (`question-card.tsx`)

Each `QuestionCard` renders a bordered card with the prompt as a label (a `*` in amber marks `required`), optional help text below, then the control from `renderInput`:

| kind | UI control | Notes |
|---|---|---|
| `text` | `<Input>` (single-line) | value `?? ''`; shows `placeholder` |
| `textarea` | `<Textarea rows={3}>` | value `?? ''`; shows `placeholder` |
| `date` | `<Input type="date">` | native date picker |
| `number` | `<Input type="number">` | empty string → `undefined`, else `Number(value)` |
| `boolean` | Two pill `ToggleChip`s ("Yes"/"No", KO "예"/"아니오") + a "Clear" link (KO "지우기") shown only once a value is set | tri-state: `true` / `false` / `undefined` |
| `select` | Native `<select>` with a leading "— Select —" (KO "— 선택 —") empty option, then one `<option>` per `options` entry | empty value → `undefined` |
| `personList` | `PersonListEditor` — a list of rows, each with a Primary/Backup badge (KO "기본"/"예비"), a full-name `Input`, a relationship `Input`, and a remove (✕) button; footer has "+ Primary" and "+ Backup" buttons (KO "+ 기본" / "+ 예비"). Adds `{ id: crypto.randomUUID(), fullName: '', isBackup }`. Empty state: "No one added yet…" | edits `VaultPerson[]` |
| `childList` | `ChildListEditor` — rows with a full-name `Input`, a `type="date"` DOB `Input`, a "Prior relationship" checkbox (KO "이전 관계"), and a remove (✕) button; footer "+ Add child" (KO "+ 자녀 추가"). Adds `{ id: crypto.randomUUID(), fullName: '' }`. Empty state: "No children added." | edits `VaultChild[]` |

The `ToggleChip` selected state uses amber styling (`border-amber-500 bg-amber-50 text-amber-800`); the person-row badge uses green for Primary (`#dcfce7`/`#166534`) and amber for Backup (`#fef3c7`/`#92400e`).

---

### Chapter 1 — `testator`

| Field | Value |
|---|---|
| title | About you (the Testator) |
| titleKo | 유언자 본인에 관하여 |
| icon | 👤 |
| intro | Let's start with your details. These populate the will's opening and signature blocks. |
| introKo | 먼저 본인의 정보부터 시작하겠습니다. 이 정보는 유언장의 서두와 서명란에 기재됩니다. |

| id | prompt (promptKo) | helpText (helpTextKo) | kind | vaultPath | options | required | skipIf |
|---|---|---|---|---|---|---|---|
| `testator-name` | Full legal name (법적 성명 전체) | Exactly as on your government ID — the will and probate application must match. (정부 발급 신분증에 기재된 것과 정확히 일치해야 합니다. 유언장과 유언검인 신청서가 일치해야 합니다.) | text | `testator.fullName` | — | ✅ | — |
| `testator-dob` | Date of birth (생년월일) | — | date | `testator.dob` | — | ✅ | — |
| `testator-address` | Residential address (거주지 주소) | City and province determine governing law and witness requirements. (거주 도시와 주(province)에 따라 준거법과 증인 요건이 결정됩니다.) | textarea | `testator.address` | — | ✅ | — |
| `testator-marital` | Marital status (혼인 상태) | — | select | `testator.maritalStatus` | see below | ✅ | — |
| `testator-occupation` | Occupation (직업) | — | text | `testator.occupation` | — | — | — |

`testator-name` placeholder: `Jane Alexandra Doe` (KO `홍 길동`). `testator-address` placeholder: `123 Bay Street, Toronto, Ontario M5H 2Y4` (same KO). `testator-occupation` placeholder: `Engineer, retired, homemaker…` (KO `엔지니어, 은퇴, 주부…`).

`testator-marital` options:

| label | labelKo | value |
|---|---|---|
| Married | 기혼 | `married` |
| Common-law partner | 사실혼 배우자 | `common_law` |
| Single | 미혼 | `single` |
| Divorced | 이혼 | `divorced` |
| Widowed | 사별 | `widowed` |

---

### Chapter 2 — `family`

| Field | Value |
|---|---|
| title | Your family |
| titleKo | 가족 |
| icon | 👨‍👩‍👧 |
| intro | Spouse and children drive residue, FLA exclusion, and guardianship clauses. |
| introKo | 배우자와 자녀는 잔여재산, 가족법(FLA)상 배제, 그리고 후견 조항을 결정하는 요소입니다. |

| id | prompt (promptKo) | helpText (helpTextKo) | kind | vaultPath | required | skipIf (plain English) |
|---|---|---|---|---|---|---|
| `spouse-included` | Do you want to include your spouse / partner in this will? (이 유언장에 배우자 / 동반자를 포함하시겠습니까?) | — | boolean | `spouse.included` | — | Skip if marital status is `single`, `divorced`, or `widowed` |
| `spouse-name` | Spouse / partner full legal name (배우자 / 동반자의 법적 성명 전체) | — | text | `spouse.fullName` | — | Skip unless `spouse.included` is true |
| `children` | Children (자녀) | Include biological, adopted, and step-children you want named. Leave empty if none. (지정하고자 하는 친생자, 입양자, 의붓자녀를 포함하십시오. 해당 사항이 없으면 비워 두십시오.) | childList | `children` | — | — |

---

### Chapter 3 — `executors`

| Field | Value |
|---|---|
| title | Executors & Guardians |
| titleKo | 유언집행자 및 후견인 |
| icon | 🛡️ |
| intro | Who administers the estate, and (if you have minor children) who cares for them. |
| introKo | 누가 재산을 관리하며, (미성년 자녀가 있는 경우) 누가 그들을 돌볼 것인지를 정합니다. |

| id | prompt (promptKo) | helpText (helpTextKo) | kind | vaultPath | required | skipIf (plain English) |
|---|---|---|---|---|---|---|
| `executors` | Executor(s) / Estate Trustee(s) (유언집행자 / 재산수탁자) | Name a primary and at least one backup. Can be a person or a trust company. (주 집행자와 최소 한 명의 예비 집행자를 지정하십시오. 개인 또는 신탁회사가 될 수 있습니다.) | personList | `executors` | ✅ | — |
| `guardians` | Guardian(s) for minor children (미성년 자녀의 후견인) | Applies only if any of your children are under 18. Name a primary and a backup. (자녀 중 18세 미만이 있는 경우에만 해당됩니다. 주 후견인과 예비 후견인을 지정하십시오.) | personList | `guardians` | — | Skip unless at least one child's DOB is under 18 (`isMinor`) |

---

### Chapter 4 — `beneficiaries`

| Field | Value |
|---|---|
| title | Beneficiaries & Gifts |
| titleKo | 수혜자 및 유증 |
| icon | 🎁 |
| intro | Who receives the estate, including specific gifts and charitable bequests. |
| introKo | 특정 유증 및 자선 유증을 포함하여 누가 재산을 받을 것인지를 정합니다. |

| id | prompt (promptKo) | helpText (helpTextKo) | kind | vaultPath | required | skipIf |
|---|---|---|---|---|---|---|
| `beneficiaries` | Residue beneficiaries (잔여재산 수혜자) | Who receives the remainder of the estate after debts, gifts, and taxes. (채무, 유증, 세금을 정산한 후 남은 재산을 누가 받을 것인지를 정합니다.) | personList | `beneficiaries` | ✅ | — |
| `charitable-giving` | Any charitable bequests? (자선 유증이 있습니까?) | — | boolean | `goals.charitableGiving` | — | — |

---

### Chapter 5 — `assets`

| Field | Value |
|---|---|
| title | Assets & Strategy |
| titleKo | 재산 및 전략 |
| icon | 💼 |
| intro | Asset profile drives the single-vs-dual-will decision and which advanced clauses apply. |
| introKo | 재산 구성은 단일 유언장 대 이중 유언장의 결정과 어떤 고급 조항이 적용되는지를 좌우합니다. |

| id | prompt (promptKo) | helpText (helpTextKo) | kind | vaultPath | required | skipIf (plain English) |
|---|---|---|---|---|---|---|
| `estimated-net-worth` | Approximate estate value (CAD) (대략적인 재산 가치 (캐나다 달러)) | Rough estimate — drives probate-fee planning only. (대략적인 추정치입니다. 유언검인 수수료 계획 목적으로만 사용됩니다.) | number | `assets.estimatedNetWorth` | — | — |
| `private-shares` | Do you own shares in a private corporation? (비상장 법인의 주식을 보유하고 계십니까?) | Private-co. shares can be kept out of probate via a Non-Probate (Secondary) Will. (비상장 법인 주식은 유언검인 대상 외(2차) 유언장을 통해 유언검인에서 제외할 수 있습니다.) | boolean | `assets.privateCompanyShares` | — | — |
| `has-dual-will` | Use a dual-will strategy to reduce probate fees? (유언검인 수수료를 줄이기 위해 이중 유언장 전략을 사용하시겠습니까?) | Recommended when private-co. shares or significant personal property exist. (비상장 법인 주식 또는 상당한 규모의 동산이 있는 경우 권장됩니다.) | boolean | `goals.hasDualWill` | — | Skip if the testator owns no private-company shares AND estimated net worth is under $1,000,000 |
| `real-estate` | Real estate holdings (부동산 보유 현황) | List each property by municipal address. Optional. (각 부동산을 행정 주소로 기재하십시오. 선택 사항입니다.) | textarea | `assets.realEstate` | — | — |
| `life-insurance` | Do you hold life insurance with a named beneficiary? (수익자가 지정된 생명보험을 보유하고 계십니까?) | — | boolean | `assets.lifeInsurance` | — | — |

---

### Chapter 6 — `special`

| Field | Value |
|---|---|
| title | Special Provisions |
| titleKo | 특별 조항 |
| icon | ⭐ |
| intro | Advanced options that only apply to some testators. Skip anything that is not relevant. |
| introKo | 일부 유언자에게만 해당되는 고급 옵션입니다. 관련 없는 항목은 건너뛰십시오. |

| id | prompt (promptKo) | helpText (helpTextKo) | kind | vaultPath | required | skipIf (plain English) |
|---|---|---|---|---|---|---|
| `henson` | Is any beneficiary receiving ODSP or similar means-tested benefits? (수혜자 중 ODSP(온타리오 장애인 지원 프로그램) 또는 이와 유사한 자산조사형 급여를 받는 사람이 있습니까?) | Triggers a Henson trust to preserve benefit eligibility. (급여 수급 자격을 유지하기 위해 헨슨 신탁(Henson trust)을 설정하게 됩니다.) | boolean | `goals.henson` | — | — |
| `minor-trust` | Hold a minor beneficiary's inheritance in trust until a set age? (미성년 수혜자의 상속분을 일정 연령에 이를 때까지 신탁으로 보유하시겠습니까?) | — | boolean | `goals.minorChildrenTrust` | — | Skip if no child is a minor AND there are no beneficiaries (condition: `!children.some(isMinor) && !beneficiaries.some(() => true)`) |
| `poa-property` | Also draft a Continuing Power of Attorney for Property? (재산관리 지속적 위임장(Continuing Power of Attorney for Property)도 함께 작성하시겠습니까?) | — | boolean | `goals.hasPoaProperty` | — | — |
| `poa-personal-care` | Also draft a Power of Attorney for Personal Care? (개인 돌봄 위임장(Power of Attorney for Personal Care)도 함께 작성하시겠습니까?) | — | boolean | `goals.hasPoaPersonalCare` | — | — |

---

### Skip-rule helper & progress logic

- `isMinor(dob)` — parses the ISO date string and returns true when computed age (using `365.25` days/year) is `< 18`; returns false for missing/invalid dates.
- `shouldAsk(q, vault)` — returns `!q.skipIf?.(vault)`; a skipped question is not rendered and does not count toward progress.
- `chapterProgress` / `overallProgress` — count `asked` (not skipped) vs `answered` (vault value is non-empty via `isFilled`), track `requiredUnanswered`, and compute a percentage (`answered / asked`, empty chapter = 100%).

---

## How Answers Become the Document (clauses, applicability, variables)

The intake answers are stored in a `WillVault`, then transformed into a finished document in three stages: (1) `determineRequiredDocuments` picks which document types to generate, (2) each document type expands to a default set of clause IDs and the applicability engine decides which conditional clauses to keep, and (3) `vaultToVariables` flattens the vault into a `{{placeholder}}` map that fills each clause's `templateText`.

### The `WillClauseTemplate` shape

Every clause in the library conforms to this interface (`frontend/src/types/will-document.ts`):

```ts
export interface WillClauseTemplate {
  id: string
  section: string
  subsection?: string
  name: string
  parentId?: string              // folder clause this belongs under
  sortOrder: number
  isFolder: boolean              // true = section header, false = actual clause
  templateText: string           // with {{placeholder}} variables
  annotation?: string            // plain-language explanation for the lawyer
  annotationKo?: string          // Korean annotation
  statute?: string               // e.g. "SLRA s.4", "FLA s.4(2)(2)"
  caselaw?: string               // e.g. "Pecore v. Pecore [2007] 1 SCR 795"
  applicableWhen?: Record<string, unknown>  // condition to auto-include
  tier: 1 | 2                    // which tier includes this clause
  children?: WillClauseTemplate[]
  documentType: WillDocumentType | 'all'  // which document this clause belongs to
}
```

A user's selections are stored separately as `SelectedWillClause` (references a `clauseId`, carries `included`, optional lawyer `customText` override, `aiGenerated`, `sortOrder`).

### The clause library structure

`clause-library.ts` holds **76 clause objects** in a single flat `willClauseLibrary: WillClauseTemplate[]`. Folder clauses (`isFolder: true`) act as section headers; leaf clauses reference their folder via `parentId` and carry the actual `templateText`. There are **15 folder/section clauses**:

| Folder `id` | `section` |
|---|---|
| `rev` | Revocation |
| `interp` | Interpretation |
| `appt` | Appointment |
| `debt` | Debts and Taxes |
| `gifts` | Specific Gifts |
| `res` | Residue |
| `fla` | FLA Exclusion |
| `trust` | Trusts |
| `gre` | Graduated Rate Estate |
| `guard` | Guardian |
| `powers` | Trustee Powers |
| `test` | Testimonium |
| `aff` | Affidavit of Execution |
| `poa-prop` | POA — Property |
| `poa-care` | POA — Personal Care |

Each clause is tagged with `documentType` — `'all'` clauses appear in every will; others are scoped to `single_will`, `probate_will`, `non_probate_will`, `poa_property`, `poa_personal_care`, or an `affidavit_*` type. `getClausesForDocumentType` returns clauses whose `documentType` matches the requested type OR equals `'all'` (with `simple_will_short` reusing the `single_will` library).

### From a document type to its default clauses

A document type is configured in `willDocumentTypes` (`index.ts`) with an explicit ordered `defaultClauseIds` array. `buildDefaultSelections(docType)` maps each ID to a `SelectedWillClause` (`included: true`, `aiGenerated: false`, `sortOrder = array index`), looking up `section`/`subsection` from the library template. Placeholder resolution is done by `resolveTemplateText`, which replaces `{{key}}` with `variables[key]`, falling back to a literal `[key]` when the variable is missing:

```ts
templateText.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `[${key}]`)
```

### Which documents get generated (`determineRequiredDocuments`)

```ts
determineRequiredDocuments({ tier, hasDualWill, hasPoaProperty, hasPoaPersonalCare, willStyle })
```

Logic:
- If `tier === 2 && hasDualWill` → `probate_will`, `non_probate_will`, `affidavit_execution_probate`, `affidavit_execution_non_probate`.
- Otherwise → one main will (`single_will` when `willStyle === "standard"`, else `simple_will_short`) plus `affidavit_execution`.
- If `hasPoaProperty` → append `poa_property`.
- If `hasPoaPersonalCare` → append `poa_personal_care`.

### The applicability engine (`applicable.ts`)

Clauses carry an optional `applicableWhen` record. `isClauseApplicable(clause, vault)` returns one of three states:

| State | Meaning |
|---|---|
| `'yes'` | clause applies → auto-include |
| `'no'` | clause does not apply → hide / grey out |
| `'unknown'` | vault fields needed to decide aren't filled yet → show but flag |

Evaluation rules:
- No `applicableWhen` (or empty) → `'yes'`.
- For each `key: expected` pair, `evaluateFlag(key, vault)` is compared to `expected`. Any mismatch → `'no'` immediately. If any flag is `'unknown'` (and none mismatched) → `'unknown'`; otherwise `'yes'`.

The supported flag keys and how each is evaluated against the vault:

| Flag key | Evaluates to | Derived from |
|---|---|---|
| `hasSpouse` | `'unknown'` if `maritalStatus` undefined; `false` if `'single'`; else `!!(spouse.included && spouse.fullName)` | `vault.testator.maritalStatus`, `vault.spouse` |
| `hasChildren` | `true` if `children.length > 0`, else `false` | `vault.children` |
| `hasMinorChildren` | `false` if no children; else `true` if any child DOB under 18 years | `vault.children[].dob` |
| `hasODSPBeneficiary` | `'unknown'` if `goals.henson` undefined; else `!!goals.henson` | `vault.goals.henson` |
| `hasRESP` | always `'unknown'` (no direct vault field yet) | — |
| `isDualWill` | `'unknown'` if `goals.hasDualWill` undefined; else `!!goals.hasDualWill` | `vault.goals.hasDualWill` |
| *(unrecognized key)* | `'unknown'` (does not block inclusion) | — |

Example clause conditions actually used in the library:

```ts
applicableWhen: { hasSpouse: true }          // e.g. "Definition of Spouse", spousal residue
applicableWhen: { hasChildren: true }        // e.g. "Definition of Children", children-per-stirpes residue
applicableWhen: { hasMinorChildren: true }   // e.g. minor-child trust, guardian appointment
applicableWhen: { hasODSPBeneficiary: true } // e.g. Henson trust
applicableWhen: { isDualWill: true }          // e.g. probate/non-probate asset definitions, dual debt allocation
applicableWhen: { hasRESP: true }             // e.g. RESP power (currently always 'unknown')
```

### Vault → `{{placeholder}}` variable map (`vault-to-variables.ts`)

`vaultToVariables(vault)` produces the `Record<string, string>` consumed by `resolveTemplateText` and the backend `document_generator.py`:

| Placeholder | Source / derivation |
|---|---|
| `testatorFullName` | `vault.testator.fullName` |
| `city` | `extractCity(vault.testator.address)` — 2nd-to-last comma-separated segment |
| `cityName` | same value as `city` |
| `province` | `extractProvince(address)` (regex over CA province names/abbrevs) or `'Ontario'` fallback |
| `spouseFullName` | `vault.spouse.fullName` (only if `spouse.included`) |
| `childNames` | grammatical list of `vault.children[].fullName` (`"A"`, `"A and B"`, `"A, B, and C"`) |
| `primaryExecutorFullName` | first executor where `!isBackup` |
| `backupExecutorFullName` | first executor where `isBackup` |
| `trusteeTitle` | constant `'Trustee'` |
| `primaryGuardianFullName` | first guardian where `!isBackup` |
| `willType` | `'Probate Will'` if `goals.hasDualWill`, else `'Last Will and Testament'` |
| `otherWillType` | `'Non-Probate Will'` if `goals.hasDualWill`, else `''` |
| `survivalDays` | default `'30'` |
| `trustDistributionAge` | default `'25'` |
| `dateOfWill` | today formatted `en-CA` long (e.g. "July 5, 2026") |

### Document types and their default clause sets (high level)

| `id` | Name | Tier | Icon | # default clauses | Sections included (folder IDs) |
|---|---|---|---|---|---|
| `simple_will_short` | Short Form Last Will and Testament | 1 | 📝 | 12 | rev, appt, debt, res, fla |
| `single_will` | Last Will and Testament | 1 | 📜 | 33 | rev, interp, appt, debt, gifts, res, fla, trust, guard, powers, test |
| `probate_will` | Last Will and Testament — Primary (Probate Will) | 2 | 📋 | 54 | rev, interp, appt, debt, gifts, res, fla, trust, gre, guard, powers, test |
| `non_probate_will` | Last Will and Testament — Secondary (Non-Probate Will) | 2 | 🔒 | 41 | rev, interp, appt, debt, res, fla, trust, powers, test |
| `poa_property` | Continuing Power of Attorney for Property | 1 | 🏠 | 5 | poa-prop |
| `poa_personal_care` | Power of Attorney for Personal Care | 1 | ❤️ | 4 | poa-care |
| `affidavit_execution` | Affidavit of Execution | 1 | ✍️ | 2 | aff |
| `affidavit_execution_probate` | Affidavit of Execution — Probate Will | 2 | ✍️ | 2 | aff |
| `affidavit_execution_non_probate` | Affidavit of Execution — Non-Probate Will | 2 | ✍️ | 2 | aff |

Representative default clause IDs by type (exact ordered arrays from `willDocumentTypes`):

```
simple_will_short:  rev, rev-single, appt, appt-primary, appt-backup,
                    debt, debt-payment, res, res-spouse, res-children-stirpes,
                    fla, fla-exclusion

single_will:        rev, rev-single, interp, interp-spouse, interp-children, interp-issue,
                    appt, appt-primary, appt-backup, appt-compensation,
                    debt, debt-payment, gifts, gifts-item, gifts-cash, gifts-charity,
                    res, res-spouse, res-children-stirpes, res-common-disaster, res-survival-period,
                    fla, fla-exclusion, trust, trust-minor, guard, guard-primary,
                    powers, powers-investment, powers-distribution-in-kind, powers-minor-payment,
                    test, test-in-person

probate_will:       rev-probate + full interp (incl. interp-probate-assets, interp-trustee-reference,
                    interp-relationship, interp-gender-number), appt (+appt-corporate, appt-trustee-decision),
                    debt (+debt-dual-allocation, debt-abatement), gifts, full residue,
                    fla, trust (+trust-henson, trust-spousal), gre + gre-maintenance, guard,
                    extensive powers (borrowing, combine-trusts, resp, realization, real-property, lending,
                    elections, exoneration, gradual-liquidation), test

non_probate_will:   rev-nonprobate + interp (incl. interp-nonprobate-assets, interp-nonprobate-defined,
                    interp-corporation-changes), appt (+appt-no-certificate, appt-trustee-decision),
                    debt-dual-allocation-np + debt-abatement, full residue, fla, trust-minor,
                    powers subset (investment, distribution-in-kind, realization, real-property, lending,
                    elections, exoneration, gradual-liquidation), test

poa_property:       poa-prop, poa-prop-appt, poa-prop-effective, poa-prop-compensation, poa-prop-restrictions
poa_personal_care:  poa-care, poa-care-appt, poa-care-wishes, poa-care-organ
affidavit_execution:              aff, aff-standard
affidavit_execution_probate:      aff, aff-probate-will
affidavit_execution_non_probate:  aff, aff-nonprobate-will
```

---

## Bilingual (EN/KO) Structure

Two separate i18n systems coexist: the **static step-wizard** uses flat dictionaries; the **conversational intake** uses inline `*Ko` sibling fields on the question script. Both share the same `Language` type.

```ts
// lib/types/will.ts
export type Language = 'en' | 'ko'
```

### 1. Step-wizard i18n — flat dicts + typed object access

`en.ts` and `ko.ts` each export one flat, deeply-nested `as const` dictionary. Keys are accessed as object properties (`t.legalName`), not via a `t('key')` function.

```ts
// lib/i18n/index.ts
export type TranslationKey = keyof typeof en
export type Translations   = typeof en
export const translations  = { en, ko } as const
export function getTranslations(lang: Language): Translations {
  return translations[lang] as unknown as Translations
}
```

The key type is anchored to `en` (`TranslationKey = keyof typeof en`), so every `t.*` read is type-checked against the English key set; `ko` mirrors the identical flat key layout (verified: both files open `export const … = {` and close `} as const`, same key order — e.g. `back/continue/save/skip`, `review_legalDisclaimer` last). A few keys hold nested objects rather than strings (e.g. `maritalStatuses: { single, … }`).

| Concern | Where |
|---|---|
| Dictionaries | `lib/i18n/en.ts`, `lib/i18n/ko.ts` |
| Selector + types | `lib/i18n/index.ts` |
| React context | `providers/i18n-provider.tsx` |

`I18nProvider` reads the language from the **will-form** reducer state (`will.language`) and exposes `{ lang, t, setLanguage }` via `useTranslation()`. `setLanguage` dispatches `SET_LANGUAGE`:

```ts
// providers/will-form-provider.tsx
case 'SET_LANGUAGE':
  return { ...state, language: action.payload }
```

### 2. `LanguageToggle`

A pill toggle (`components/will/language-toggle.tsx`) with two buttons — **EN** and **한국어** — driven entirely by `useTranslation()`:

```tsx
const { lang, setLanguage } = useTranslation()
<button onClick={() => setLanguage('en')} …>EN</button>
<button onClick={() => setLanguage('ko')} …>한국어</button>
```

The active language gets `bg-white shadow text-gray-900`; the inactive one is muted gray.

### 3. Conversational-intake i18n — `*Ko` siblings + `L()` helper

The intake flow does **not** use the flat dicts. Language lives in a separate Zustand store, defaulting to English:

```ts
// stores/will-vault-store.ts
language: 'en' as Language,
setLanguage: (language) => set({ language }),
```

Each question/chapter in the script (`lib/intake/will-intake-script.ts`) carries **optional Korean siblings** next to its English text. Fields with a `*Ko` variant: `promptKo`, `helpTextKo`, `placeholderKo`, `titleKo`, `introKo`, and per-option `labelKo`.

```ts
export interface IntakeQuestion {
  prompt: string
  promptKo?: string
  helpText?: string
  helpTextKo?: string
  options?: Array<{ label: string; labelKo?: string; value: string }>
  placeholder?: string
  placeholderKo?: string
  // …
}
export interface IntakeChapter { title: string; titleKo?: string; intro: string; introKo?: string; /* … */ }
```

Rendering picks the variant with a two-arg fallback helper (`lib/intake/localize.ts`):

```ts
export function L(lang: Language, en: string, ko?: string): string {
  return lang === 'ko' && ko ? ko : en   // Korean only if 'ko' AND a translation exists
}
```

`L()` is called at every intake render site — `question-card.tsx` (`L(language, question.prompt, question.promptKo)`, Yes/No chips, select placeholders, personList/childList labels), `chapter-stepper.tsx`, and `extracted-data-sidebar.tsx` (which also inlines ad-hoc Korean literals, e.g. `L(lang, 'Full name', '전체 이름')`).

### Product rule — questions translated, documents stay English

Only questionnaire/UI text is bilingual. The document layer ignores language: `lib/will-documents/vault-to-variables.ts` references `language`/`lang` **zero** times, and the clause library's legal clause text is English. The only Korean in `will-documents/` is `annotationKo` fields in `clause-library.ts` — Korean explanations shown *about* a clause in the UI (e.g. the dual-will / non-probate annotations), not the generated clause body. Generated legal documents remain English.
