/**
 * Declarative intake script. Each chapter groups related questions that
 * write into the vault at a dot-path. The intake UI renders one chapter
 * at a time and advances by `required`-then-progress rules. Skip rules
 * evaluate against the live vault so, e.g., single testators don't get
 * spouse questions.
 */

import type { WillVault, VaultPath } from '@/types/will-vault'

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
  helpText?: string
  kind: QuestionKind
  options?: Array<{ label: string; value: string }>
  required?: boolean
  skipIf?: (v: WillVault) => boolean
  validate?: (value: unknown) => string | null
  placeholder?: string
}

export interface IntakeChapter {
  id: string
  title: string
  icon: string
  intro: string
  questions: IntakeQuestion[]
}

export const willIntakeChapters: IntakeChapter[] = [
  {
    id: 'testator',
    title: 'About you (the Testator)',
    icon: '👤',
    intro: "Let's start with your details. These populate the will's opening and signature blocks.",
    questions: [
      {
        id: 'testator-name',
        vaultPath: 'testator.fullName',
        prompt: 'Full legal name',
        helpText: 'Exactly as on your government ID — the will and probate application must match.',
        kind: 'text',
        required: true,
        placeholder: 'Jane Alexandra Doe',
      },
      {
        id: 'testator-dob',
        vaultPath: 'testator.dob',
        prompt: 'Date of birth',
        kind: 'date',
        required: true,
      },
      {
        id: 'testator-address',
        vaultPath: 'testator.address',
        prompt: 'Residential address',
        helpText: 'City and province determine governing law and witness requirements.',
        kind: 'textarea',
        required: true,
        placeholder: '123 Bay Street, Toronto, Ontario M5H 2Y4',
      },
      {
        id: 'testator-marital',
        vaultPath: 'testator.maritalStatus',
        prompt: 'Marital status',
        kind: 'select',
        required: true,
        options: [
          { label: 'Married', value: 'married' },
          { label: 'Common-law partner', value: 'common_law' },
          { label: 'Single', value: 'single' },
          { label: 'Divorced', value: 'divorced' },
          { label: 'Widowed', value: 'widowed' },
        ],
      },
      {
        id: 'testator-occupation',
        vaultPath: 'testator.occupation',
        prompt: 'Occupation',
        kind: 'text',
        placeholder: 'Engineer, retired, homemaker…',
      },
    ],
  },
  {
    id: 'family',
    title: 'Your family',
    icon: '👨‍👩‍👧',
    intro: 'Spouse and children drive residue, FLA exclusion, and guardianship clauses.',
    questions: [
      {
        id: 'spouse-included',
        vaultPath: 'spouse.included',
        prompt: 'Do you want to include your spouse / partner in this will?',
        kind: 'boolean',
        skipIf: (v) => v.testator.maritalStatus === 'single' || v.testator.maritalStatus === 'divorced' || v.testator.maritalStatus === 'widowed',
      },
      {
        id: 'spouse-name',
        vaultPath: 'spouse.fullName',
        prompt: 'Spouse / partner full legal name',
        kind: 'text',
        skipIf: (v) => !v.spouse?.included,
      },
      {
        id: 'children',
        vaultPath: 'children',
        prompt: 'Children',
        helpText: 'Include biological, adopted, and step-children you want named. Leave empty if none.',
        kind: 'childList',
      },
    ],
  },
  {
    id: 'executors',
    title: 'Executors & Guardians',
    icon: '🛡️',
    intro: 'Who administers the estate, and (if you have minor children) who cares for them.',
    questions: [
      {
        id: 'executors',
        vaultPath: 'executors',
        prompt: 'Executor(s) / Estate Trustee(s)',
        helpText: 'Name a primary and at least one backup. Can be a person or a trust company.',
        kind: 'personList',
        required: true,
      },
      {
        id: 'guardians',
        vaultPath: 'guardians',
        prompt: 'Guardian(s) for minor children',
        helpText: 'Applies only if any of your children are under 18. Name a primary and a backup.',
        kind: 'personList',
        skipIf: (v) => !v.children.some((c) => isMinor(c.dob)),
      },
    ],
  },
  {
    id: 'beneficiaries',
    title: 'Beneficiaries & Gifts',
    icon: '🎁',
    intro: 'Who receives the estate, including specific gifts and charitable bequests.',
    questions: [
      {
        id: 'beneficiaries',
        vaultPath: 'beneficiaries',
        prompt: 'Residue beneficiaries',
        helpText: 'Who receives the remainder of the estate after debts, gifts, and taxes.',
        kind: 'personList',
        required: true,
      },
      {
        id: 'charitable-giving',
        vaultPath: 'goals.charitableGiving',
        prompt: 'Any charitable bequests?',
        kind: 'boolean',
      },
    ],
  },
  {
    id: 'assets',
    title: 'Assets & Strategy',
    icon: '💼',
    intro: 'Asset profile drives the single-vs-dual-will decision and which advanced clauses apply.',
    questions: [
      {
        id: 'estimated-net-worth',
        vaultPath: 'assets.estimatedNetWorth',
        prompt: 'Approximate estate value (CAD)',
        helpText: 'Rough estimate — drives probate-fee planning only.',
        kind: 'number',
      },
      {
        id: 'private-shares',
        vaultPath: 'assets.privateCompanyShares',
        prompt: 'Do you own shares in a private corporation?',
        helpText: 'Private-co. shares can be kept out of probate via a Non-Probate (Secondary) Will.',
        kind: 'boolean',
      },
      {
        id: 'has-dual-will',
        vaultPath: 'goals.hasDualWill',
        prompt: 'Use a dual-will strategy to reduce probate fees?',
        helpText: 'Recommended when private-co. shares or significant personal property exist.',
        kind: 'boolean',
        skipIf: (v) => !v.assets.privateCompanyShares && (v.assets.estimatedNetWorth ?? 0) < 1_000_000,
      },
      {
        id: 'real-estate',
        vaultPath: 'assets.realEstate',
        prompt: 'Real estate holdings',
        helpText: 'List each property by municipal address. Optional.',
        kind: 'textarea',
      },
      {
        id: 'life-insurance',
        vaultPath: 'assets.lifeInsurance',
        prompt: 'Do you hold life insurance with a named beneficiary?',
        kind: 'boolean',
      },
    ],
  },
  {
    id: 'special',
    title: 'Special Provisions',
    icon: '⭐',
    intro: 'Advanced options that only apply to some testators. Skip anything that is not relevant.',
    questions: [
      {
        id: 'henson',
        vaultPath: 'goals.henson',
        prompt: 'Is any beneficiary receiving ODSP or similar means-tested benefits?',
        helpText: 'Triggers a Henson trust to preserve benefit eligibility.',
        kind: 'boolean',
      },
      {
        id: 'minor-trust',
        vaultPath: 'goals.minorChildrenTrust',
        prompt: 'Hold a minor beneficiary\'s inheritance in trust until a set age?',
        kind: 'boolean',
        skipIf: (v) => !v.children.some((c) => isMinor(c.dob)) && !v.beneficiaries.some((b) => true),
      },
      {
        id: 'poa-property',
        vaultPath: 'goals.hasPoaProperty',
        prompt: 'Also draft a Continuing Power of Attorney for Property?',
        kind: 'boolean',
      },
      {
        id: 'poa-personal-care',
        vaultPath: 'goals.hasPoaPersonalCare',
        prompt: 'Also draft a Power of Attorney for Personal Care?',
        kind: 'boolean',
      },
    ],
  },
]

// ── Helpers ────────────────────────────────────────────────────────────

function isMinor(dob?: string): boolean {
  if (!dob) return false
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return false
  const ageMs = Date.now() - d.getTime()
  const years = ageMs / (1000 * 60 * 60 * 24 * 365.25)
  return years < 18
}

/**
 * Evaluate skipIf against the live vault. A skipped question contributes
 * nothing to progress and is not rendered by the UI.
 */
export function shouldAsk(q: IntakeQuestion, vault: WillVault): boolean {
  return !q.skipIf?.(vault)
}

/**
 * Per-chapter progress math. `asked` = questions not skipped by rules.
 * `answered` = asked questions whose vault value is not empty.
 */
export function chapterProgress(
  chapter: IntakeChapter,
  vault: WillVault
): { asked: number; answered: number; pct: number; requiredUnanswered: number } {
  let asked = 0
  let answered = 0
  let requiredUnanswered = 0
  for (const q of chapter.questions) {
    if (!shouldAsk(q, vault)) continue
    asked++
    const value = getAtPath(vault, q.vaultPath)
    if (isFilled(value)) answered++
    else if (q.required) requiredUnanswered++
  }
  const pct = asked === 0 ? 100 : Math.round((answered / asked) * 100)
  return { asked, answered, pct, requiredUnanswered }
}

function getAtPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj)
}

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

/** Overall completeness across all chapters. */
export function overallProgress(vault: WillVault): { pct: number; requiredUnanswered: number } {
  let asked = 0
  let answered = 0
  let requiredUnanswered = 0
  for (const ch of willIntakeChapters) {
    const p = chapterProgress(ch, vault)
    asked += p.asked
    answered += p.answered
    requiredUnanswered += p.requiredUnanswered
  }
  return {
    pct: asked === 0 ? 0 : Math.round((answered / asked) * 100),
    requiredUnanswered,
  }
}
