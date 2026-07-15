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

export const willIntakeChapters: IntakeChapter[] = [
  {
    id: 'testator',
    title: 'About you (the Testator)',
    titleKo: '유언자 본인에 관하여',
    icon: '👤',
    intro: "Let's start with your details. These populate the will's opening and signature blocks.",
    introKo: '먼저 본인의 정보부터 시작하겠습니다. 이 정보는 유언장의 서두와 서명란에 기재됩니다.',
    questions: [
      {
        id: 'testator-name',
        vaultPath: 'testator.fullName',
        prompt: 'Full legal name',
        promptKo: '법적 성명 전체',
        helpText: 'Exactly as on your government ID — the will and probate application must match.',
        helpTextKo: '정부 발급 신분증에 기재된 것과 정확히 일치해야 합니다. 유언장과 유언검인 신청서가 일치해야 합니다.',
        kind: 'text',
        required: true,
        placeholder: 'Jane Alexandra Doe',
        placeholderKo: '홍 길동',
      },
      {
        id: 'testator-dob',
        vaultPath: 'testator.dob',
        prompt: 'Date of birth',
        promptKo: '생년월일',
        kind: 'date',
        required: true,
      },
      {
        id: 'testator-address',
        vaultPath: 'testator.address',
        prompt: 'Residential address',
        promptKo: '거주지 주소',
        helpText: 'City and province determine governing law and witness requirements.',
        helpTextKo: '거주 도시와 주(province)에 따라 준거법과 증인 요건이 결정됩니다.',
        kind: 'textarea',
        required: true,
        placeholder: '123 Bay Street, Toronto, Ontario M5H 2Y4',
        placeholderKo: '123 Bay Street, Toronto, Ontario M5H 2Y4',
      },
      {
        id: 'testator-marital',
        vaultPath: 'testator.maritalStatus',
        prompt: 'Marital status',
        promptKo: '혼인 상태',
        kind: 'select',
        required: true,
        options: [
          { label: 'Married', labelKo: '기혼', value: 'married' },
          { label: 'Common-law partner', labelKo: '사실혼 배우자', value: 'common_law' },
          { label: 'Single', labelKo: '미혼', value: 'single' },
          { label: 'Divorced', labelKo: '이혼', value: 'divorced' },
          { label: 'Widowed', labelKo: '사별', value: 'widowed' },
        ],
      },
      {
        id: 'testator-occupation',
        vaultPath: 'testator.occupation',
        prompt: 'Occupation',
        promptKo: '직업',
        kind: 'text',
        placeholder: 'Engineer, retired, homemaker…',
        placeholderKo: '엔지니어, 은퇴, 주부…',
      },
    ],
  },
  {
    id: 'family',
    title: 'Your family',
    titleKo: '가족',
    icon: '👨‍👩‍👧',
    intro: 'Spouse and children drive residue, FLA exclusion, and guardianship clauses.',
    introKo: '배우자와 자녀는 잔여재산, 가족법(FLA)상 배제, 그리고 후견 조항을 결정하는 요소입니다.',
    questions: [
      {
        id: 'spouse-included',
        vaultPath: 'spouse.included',
        prompt: 'Do you want to include your spouse / partner in this will?',
        promptKo: '이 유언장에 배우자 / 동반자를 포함하시겠습니까?',
        kind: 'boolean',
        skipIf: (v) => v.testator.maritalStatus === 'single' || v.testator.maritalStatus === 'divorced' || v.testator.maritalStatus === 'widowed',
      },
      {
        id: 'spouse-name',
        vaultPath: 'spouse.fullName',
        prompt: 'Spouse / partner full legal name',
        promptKo: '배우자 / 동반자의 법적 성명 전체',
        kind: 'text',
        skipIf: (v) => !v.spouse?.included,
      },
      {
        id: 'children',
        vaultPath: 'children',
        prompt: 'Children',
        promptKo: '자녀',
        helpText: 'Include biological, adopted, and step-children you want named. Leave empty if none.',
        helpTextKo: '지정하고자 하는 친생자, 입양자, 의붓자녀를 포함하십시오. 해당 사항이 없으면 비워 두십시오.',
        kind: 'childList',
      },
    ],
  },
  {
    id: 'executors',
    title: 'Executors & Guardians',
    titleKo: '유언집행자 및 후견인',
    icon: '🛡️',
    intro: 'Who administers the estate, and (if you have minor children) who cares for them.',
    introKo: '누가 재산을 관리하며, (미성년 자녀가 있는 경우) 누가 그들을 돌볼 것인지를 정합니다.',
    questions: [
      {
        id: 'executors',
        vaultPath: 'executors',
        prompt: 'Executor(s) / Estate Trustee(s)',
        promptKo: '유언집행자 / 재산수탁자',
        helpText: 'Name a primary and at least one backup. Can be a person or a trust company.',
        helpTextKo: '주 집행자와 최소 한 명의 예비 집행자를 지정하십시오. 개인 또는 신탁회사가 될 수 있습니다.',
        kind: 'personList',
        required: true,
      },
      {
        id: 'guardians',
        vaultPath: 'guardians',
        prompt: 'Guardian(s) for minor children',
        promptKo: '미성년 자녀의 후견인',
        helpText: 'Applies only if any of your children are under 18. Name a primary and a backup.',
        helpTextKo: '자녀 중 18세 미만이 있는 경우에만 해당됩니다. 주 후견인과 예비 후견인을 지정하십시오.',
        kind: 'personList',
        skipIf: (v) => !v.children.some((c) => isMinor(c.dob)),
      },
    ],
  },
  {
    id: 'beneficiaries',
    title: 'Beneficiaries & Gifts',
    titleKo: '수혜자 및 유증',
    icon: '🎁',
    intro: 'Who receives the estate, including specific gifts and charitable bequests.',
    introKo: '특정 유증 및 자선 유증을 포함하여 누가 재산을 받을 것인지를 정합니다.',
    questions: [
      {
        id: 'beneficiaries',
        vaultPath: 'beneficiaries',
        prompt: 'Residue beneficiaries',
        promptKo: '잔여재산 수혜자',
        helpText: 'Who receives the remainder of the estate after debts, gifts, and taxes.',
        helpTextKo: '채무, 유증, 세금을 정산한 후 남은 재산을 누가 받을 것인지를 정합니다.',
        kind: 'personList',
        required: true,
      },
      {
        id: 'charitable-giving',
        vaultPath: 'goals.charitableGiving',
        prompt: 'Any charitable bequests?',
        promptKo: '자선 유증이 있습니까?',
        kind: 'boolean',
      },
    ],
  },
  {
    id: 'assets',
    title: 'Assets & Strategy',
    titleKo: '재산 및 전략',
    icon: '💼',
    intro: 'Asset profile drives the single-vs-dual-will decision and which advanced clauses apply.',
    introKo: '재산 구성은 단일 유언장 대 이중 유언장의 결정과 어떤 고급 조항이 적용되는지를 좌우합니다.',
    questions: [
      {
        id: 'estimated-net-worth',
        vaultPath: 'assets.estimatedNetWorth',
        prompt: 'Approximate estate value (CAD)',
        promptKo: '대략적인 재산 가치 (캐나다 달러)',
        helpText: 'Rough estimate — drives probate-fee planning only.',
        helpTextKo: '대략적인 추정치입니다. 유언검인 수수료 계획 목적으로만 사용됩니다.',
        kind: 'number',
      },
      {
        id: 'private-shares',
        vaultPath: 'assets.privateCompanyShares',
        prompt: 'Do you own shares in a private corporation?',
        promptKo: '비상장 법인의 주식을 보유하고 계십니까?',
        helpText: 'Private-co. shares can be kept out of probate via a Non-Probate (Secondary) Will.',
        helpTextKo: '비상장 법인 주식은 유언검인 대상 외(2차) 유언장을 통해 유언검인에서 제외할 수 있습니다.',
        kind: 'boolean',
      },
      {
        id: 'has-dual-will',
        vaultPath: 'goals.hasDualWill',
        prompt: 'Use a dual-will strategy to reduce probate fees?',
        promptKo: '유언검인 수수료를 줄이기 위해 이중 유언장 전략을 사용하시겠습니까?',
        helpText: 'Recommended when private-co. shares or significant personal property exist.',
        helpTextKo: '비상장 법인 주식 또는 상당한 규모의 동산이 있는 경우 권장됩니다.',
        kind: 'boolean',
        skipIf: (v) => !v.assets.privateCompanyShares && (v.assets.estimatedNetWorth ?? 0) < 1_000_000,
      },
      {
        id: 'real-estate',
        vaultPath: 'assets.realEstate',
        prompt: 'Real estate holdings',
        promptKo: '부동산 보유 현황',
        helpText: 'List each property by municipal address. Optional.',
        helpTextKo: '각 부동산을 행정 주소로 기재하십시오. 선택 사항입니다.',
        kind: 'textarea',
      },
      {
        id: 'life-insurance',
        vaultPath: 'assets.lifeInsurance',
        prompt: 'Do you hold life insurance with a named beneficiary?',
        promptKo: '수익자가 지정된 생명보험을 보유하고 계십니까?',
        kind: 'boolean',
      },
    ],
  },
  {
    id: 'special',
    title: 'Special Provisions',
    titleKo: '특별 조항',
    icon: '⭐',
    intro: 'Advanced options that only apply to some testators. Skip anything that is not relevant.',
    introKo: '일부 유언자에게만 해당되는 고급 옵션입니다. 관련 없는 항목은 건너뛰십시오.',
    questions: [
      {
        id: 'henson',
        vaultPath: 'goals.henson',
        prompt: 'Is any beneficiary receiving ODSP or similar means-tested benefits?',
        promptKo: '수혜자 중 ODSP(온타리오 장애인 지원 프로그램) 또는 이와 유사한 자산조사형 급여를 받는 사람이 있습니까?',
        helpText: 'Triggers a Henson trust to preserve benefit eligibility.',
        helpTextKo: '급여 수급 자격을 유지하기 위해 헨슨 신탁(Henson trust)을 설정하게 됩니다.',
        kind: 'boolean',
      },
      {
        id: 'minor-trust',
        vaultPath: 'goals.minorChildrenTrust',
        prompt: 'Hold a minor beneficiary\'s inheritance in trust until a set age?',
        promptKo: '미성년 수혜자의 상속분을 일정 연령에 이를 때까지 신탁으로 보유하시겠습니까?',
        kind: 'boolean',
        skipIf: (v) => !v.children.some((c) => isMinor(c.dob)) && !v.beneficiaries.some((b) => true),
      },
      {
        id: 'poa-property',
        vaultPath: 'goals.hasPoaProperty',
        prompt: 'Also draft a Continuing Power of Attorney for Property?',
        promptKo: '재산관리 지속적 위임장(Continuing Power of Attorney for Property)도 함께 작성하시겠습니까?',
        kind: 'boolean',
      },
      {
        id: 'poa-personal-care',
        vaultPath: 'goals.hasPoaPersonalCare',
        prompt: 'Also draft a Power of Attorney for Personal Care?',
        promptKo: '개인 돌봄 위임장(Power of Attorney for Personal Care)도 함께 작성하시겠습니까?',
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
