/**
 * Canonical, declarative client intake for issue #75.
 *
 * Every form and chat answer writes to the versioned WillVault. Legal strategy
 * questions request lawyer review; they do not approve clauses or documents.
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
  | 'beneficiaryList'
  | 'giftList'
  | 'assetList'
  | 'liabilityList'

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
  validate?: (value: unknown, vault: WillVault) => string | null
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

const maritalOptions = [
  { label: 'Married', labelKo: '기혼', value: 'married' },
  { label: 'Common-law partner', labelKo: '사실혼 배우자', value: 'common_law' },
  { label: 'Single', labelKo: '미혼', value: 'single' },
  { label: 'Divorced', labelKo: '이혼', value: 'divorced' },
  { label: 'Widowed', labelKo: '사별', value: 'widowed' },
]

const noCurrentPartner = (v: WillVault) =>
  ['single', 'divorced', 'widowed'].includes(v.testator.maritalStatus ?? '')

export const willIntakeChapters: IntakeChapter[] = [
  {
    id: 'testator',
    title: 'About you',
    titleKo: '본인 정보',
    icon: '1',
    intro: 'Your identity and contact details. Use your full legal name.',
    introKo: '본인의 신원 및 연락처 정보입니다. 법적 성명 전체를 입력해 주세요.',
    questions: [
      {
        id: 'testator-name', vaultPath: 'testator.fullName', prompt: 'Full legal name',
        promptKo: '법적 성명 전체', kind: 'text', required: true,
        helpText: 'Enter it exactly as it appears on your government identification.',
        helpTextKo: '정부 발급 신분증에 기재된 것과 정확히 동일하게 입력해 주세요.',
      },
      {
        id: 'preferred-name', vaultPath: 'testator.preferredName',
        prompt: 'Preferred name (optional)', promptKo: '선호하는 이름 (선택 사항)', kind: 'text',
      },
      {
        id: 'testator-dob', vaultPath: 'testator.dob', prompt: 'Date of birth',
        promptKo: '생년월일', kind: 'date', required: true,
      },
      {
        id: 'testator-address', vaultPath: 'testator.address', prompt: 'Residential address',
        promptKo: '거주지 주소', kind: 'textarea', required: true,
        helpText: 'Include city, province, and postal code. This helps the lawyer confirm jurisdiction.',
        helpTextKo: '도시, 주 및 우편번호를 포함해 주세요. 변호사가 관할권을 확인하는 데 사용됩니다.',
      },
      {
        id: 'testator-email', vaultPath: 'testator.email', prompt: 'Email address',
        promptKo: '이메일 주소', kind: 'text', required: true,
        validate: (value) => /.+@.+\..+/.test(String(value ?? ''))
          ? null : 'Enter a valid email address.',
      },
      {
        id: 'testator-phone', vaultPath: 'testator.phone', prompt: 'Phone number (optional)',
        promptKo: '전화번호 (선택 사항)', kind: 'text',
      },
      {
        id: 'testator-marital', vaultPath: 'testator.maritalStatus', prompt: 'Marital status',
        promptKo: '혼인 상태', kind: 'select', required: true, options: maritalOptions,
      },
      {
        id: 'testator-occupation', vaultPath: 'testator.occupation', prompt: 'Occupation (optional)',
        promptKo: '직업 (선택 사항)', kind: 'text',
      },
      {
        id: 'testator-citizenship', vaultPath: 'testator.citizenship',
        prompt: 'Citizenship or tax residence outside Canada (optional)',
        promptKo: '캐나다 외 시민권 또는 세금 거주지 (선택 사항)', kind: 'text',
        helpText: 'The lawyer may need to discuss cross-border tax or estate issues.',
        helpTextKo: '변호사가 국경 간 세금 또는 상속 문제를 검토해야 할 수 있습니다.',
      },
    ],
  },
  {
    id: 'family',
    title: 'Family and dependants',
    titleKo: '가족 및 부양가족',
    icon: '2',
    intro: 'Family relationships can change which protections and questions apply.',
    introKo: '가족 관계에 따라 적용되는 보호 조항과 질문이 달라질 수 있습니다.',
    questions: [
      {
        id: 'spouse-included', vaultPath: 'spouse.included',
        prompt: 'Do you have a spouse or partner to include in this plan?',
        promptKo: '이 계획에 포함할 배우자 또는 동반자가 있습니까?', kind: 'boolean',
        skipIf: noCurrentPartner,
      },
      {
        id: 'spouse-name', vaultPath: 'spouse.fullName', prompt: 'Spouse or partner full legal name',
        promptKo: '배우자 또는 동반자의 법적 성명 전체', kind: 'text', required: true,
        skipIf: (v) => noCurrentPartner(v) || !v.spouse?.included,
      },
      {
        id: 'separated', vaultPath: 'spouse.separated',
        prompt: 'Are you currently separated from this person?',
        promptKo: '현재 이 사람과 별거 중입니까?', kind: 'boolean',
        skipIf: (v) => noCurrentPartner(v) || !v.spouse?.included,
        helpText: 'The lawyer must review separation facts; the app will not make the legal decision.',
        helpTextKo: '별거 사실은 변호사가 검토해야 하며, 앱이 법적 결정을 내리지 않습니다.',
      },
      {
        id: 'separation-date', vaultPath: 'spouse.separationDate',
        prompt: 'Approximate separation date', promptKo: '대략적인 별거일', kind: 'date',
        required: true, skipIf: (v) => !v.spouse?.separated,
      },
      {
        id: 'children', vaultPath: 'children', prompt: 'Children and dependants',
        promptKo: '자녀 및 부양가족', kind: 'childList',
        helpText: 'Include biological, adopted, and stepchildren. Mark prior relationships, dependency, or ODSP where relevant.',
        helpTextKo: '친생자, 입양자 및 의붓자녀를 포함하고 해당되는 경우 이전 관계, 부양 또는 ODSP 여부를 표시해 주세요.',
      },
    ],
  },
  {
    id: 'executors',
    title: 'Executors and guardians',
    titleKo: '유언집행자 및 후견인',
    icon: '3',
    intro: 'Choose who should administer the estate and, if needed, care for minor children.',
    introKo: '유산을 관리할 사람과 필요한 경우 미성년 자녀를 돌볼 사람을 선택해 주세요.',
    questions: [
      {
        id: 'executors', vaultPath: 'executors', prompt: 'Executor or Estate Trustee choices',
        promptKo: '유언집행자 또는 재산수탁자 선택', kind: 'personList', required: true,
        helpText: 'Add a primary choice and, if possible, at least one backup.',
        helpTextKo: '주 선택자와 가능하면 최소 한 명의 예비 선택자를 추가해 주세요.',
        validate: (value) => validatePrimaryPerson(value, 'executor'),
      },
      {
        id: 'corporate-trustee', vaultPath: 'corporateTrusteeName',
        prompt: 'Trust company or other fallback (optional)',
        promptKo: '신탁회사 또는 기타 대체 선택 (선택 사항)', kind: 'text',
      },
      {
        id: 'guardians', vaultPath: 'guardians', prompt: 'Guardian choices for minor children',
        promptKo: '미성년 자녀의 후견인 선택', kind: 'personList',
        skipIf: (v) => !v.children.some((c) => isMinor(c.dob)),
      },
    ],
  },
  {
    id: 'beneficiaries',
    title: 'Beneficiaries and residue',
    titleKo: '수혜자 및 잔여재산',
    icon: '4',
    intro: 'Tell us who should receive what remains after debts, taxes, and specific gifts.',
    introKo: '채무, 세금 및 특정 유증 후 남은 재산을 누가 받을지 알려 주세요.',
    questions: [
      {
        id: 'residue-method', vaultPath: 'residueDistribution',
        prompt: 'How should the residue be divided?', promptKo: '잔여재산을 어떻게 분배할까요?',
        kind: 'select', required: true, options: [
          { label: 'Equally among the people I name', labelKo: '지정한 사람들에게 균등 분배', value: 'equal' },
          { label: 'Using percentages', labelKo: '백분율로 분배', value: 'percentages' },
          { label: 'By family branch (per stirpes)', labelKo: '가족 계통별 분배', value: 'per_stirpes' },
          { label: 'I need the lawyer to help me decide', labelKo: '변호사의 도움이 필요함', value: 'lawyer_help' },
        ],
      },
      {
        id: 'beneficiaries', vaultPath: 'beneficiaries', prompt: 'Residue beneficiaries',
        promptKo: '잔여재산 수혜자', kind: 'beneficiaryList', required: true,
        helpText: 'If using percentages, they must total 100% before submission.',
        helpTextKo: '백분율을 사용하는 경우 제출 전에 합계가 100%여야 합니다.',
        validate: (value, vault) => validateBeneficiaries(value, vault.residueDistribution),
      },
      {
        id: 'contingent-beneficiaries', vaultPath: 'contingentBeneficiaries',
        prompt: 'Backup beneficiaries (optional)', promptKo: '예비 수혜자 (선택 사항)',
        kind: 'beneficiaryList',
      },
    ],
  },
  {
    id: 'gifts',
    title: 'Specific gifts and charities',
    titleKo: '특정 유증 및 자선단체',
    icon: '5',
    intro: 'Add only gifts you want specifically identified in the will.',
    introKo: '유언장에 구체적으로 명시하고 싶은 유증만 추가해 주세요.',
    questions: [
      {
        id: 'gifts', vaultPath: 'gifts', prompt: 'Specific gifts (optional)',
        promptKo: '특정 유증 (선택 사항)', kind: 'giftList',
        helpText: 'You can add cash, an item, real estate, a charity, or pet-care instructions.',
        helpTextKo: '현금, 물품, 부동산, 자선단체 또는 반려동물 돌봄 지침을 추가할 수 있습니다.',
      },
    ],
  },
  {
    id: 'trusts',
    title: 'Children and trusts',
    titleKo: '자녀 및 신탁',
    icon: '6',
    intro: 'These answers identify topics for the lawyer to discuss; they do not create a trust automatically.',
    introKo: '이 답변은 변호사가 검토할 주제를 식별하며 자동으로 신탁을 만들지 않습니다.',
    questions: [
      {
        id: 'minor-trust', vaultPath: 'goals.minorChildrenTrust',
        prompt: 'Should a young beneficiary’s inheritance be held until a later age?',
        promptKo: '어린 수혜자의 상속분을 특정 연령까지 신탁으로 보유할까요?', kind: 'boolean',
      },
      {
        id: 'trust-age', vaultPath: 'trustDistributionAge',
        prompt: 'Preferred distribution age', promptKo: '희망 분배 연령', kind: 'number',
        required: true, skipIf: (v) => !v.goals.minorChildrenTrust,
        validate: (value) => Number(value) >= 18 && Number(value) <= 40
          ? null : 'Choose an age between 18 and 40, or ask the lawyer for help.',
      },
      {
        id: 'henson', vaultPath: 'goals.henson',
        prompt: 'Does any beneficiary receive ODSP or similar means-tested benefits?',
        promptKo: '수혜자 중 ODSP 또는 유사한 자산조사형 급여를 받는 사람이 있습니까?', kind: 'boolean',
        helpText: 'A Yes answer creates a lawyer-review flag for possible Henson-trust planning.',
        helpTextKo: '예라고 답하면 헨슨 신탁 가능성에 대한 변호사 검토 표시가 생성됩니다.',
      },
      {
        id: 'spousal-trust', vaultPath: 'goals.spousalTrust',
        prompt: 'Would you like the lawyer to discuss a trust for your spouse?',
        promptKo: '배우자를 위한 신탁을 변호사와 논의하시겠습니까?', kind: 'boolean',
        skipIf: (v) => !v.spouse?.included,
      },
    ],
  },
  {
    id: 'assets',
    title: 'Assets and debts',
    titleKo: '자산 및 채무',
    icon: '7',
    intro: 'A useful overview helps the lawyer identify what passes through the estate.',
    introKo: '유용한 개요는 변호사가 유산을 통해 이전되는 재산을 식별하는 데 도움이 됩니다.',
    questions: [
      {
        id: 'estimated-net-worth', vaultPath: 'assets.estimatedNetWorth',
        prompt: 'Approximate net estate value in Canadian dollars (optional)',
        promptKo: '대략적인 순유산 가치, 캐나다 달러 (선택 사항)', kind: 'number',
      },
      {
        id: 'asset-items', vaultPath: 'assets.items', prompt: 'Assets (optional)',
        promptKo: '자산 (선택 사항)', kind: 'assetList',
        helpText: 'Do not enter full account, policy, or government-identification numbers.',
        helpTextKo: '전체 계좌번호, 보험증권번호 또는 정부 발급 신분증 번호를 입력하지 마세요.',
      },
      {
        id: 'liabilities', vaultPath: 'assets.liabilities', prompt: 'Material debts (optional)',
        promptKo: '주요 채무 (선택 사항)', kind: 'liabilityList',
      },
      {
        id: 'private-shares', vaultPath: 'assets.privateCompanyShares',
        prompt: 'Do you own private-company shares or a shareholder loan?',
        promptKo: '비상장회사 주식 또는 주주대여금을 보유하고 있습니까?', kind: 'boolean',
      },
      {
        id: 'dual-will-review', vaultPath: 'goals.dualWillReviewRequested',
        prompt: 'Would you like the lawyer to assess whether two wills may reduce probate cost?',
        promptKo: '두 개의 유언장이 유언검인 비용을 줄일 수 있는지 변호사에게 검토를 요청하시겠습니까?',
        kind: 'boolean',
        helpText: 'This requests a discussion only. The lawyer decides whether a dual-will strategy is appropriate.',
        helpTextKo: '이는 상담 요청일 뿐이며, 이중 유언장 전략의 적합성은 변호사가 결정합니다.',
      },
    ],
  },
  {
    id: 'poa',
    title: 'Powers of attorney',
    titleKo: '위임장',
    icon: '8',
    intro: 'Choose trusted people for financial decisions and personal-care decisions while you are alive.',
    introKo: '생전에 재정 및 개인 돌봄 결정을 맡길 신뢰할 수 있는 사람을 선택해 주세요.',
    questions: [
      {
        id: 'poa-property', vaultPath: 'poa.property.requested',
        prompt: 'Do you want a Continuing Power of Attorney for Property?',
        promptKo: '재산관리 지속적 위임장을 원하십니까?', kind: 'boolean', required: true,
      },
      {
        id: 'poa-property-attorneys', vaultPath: 'poa.property.attorneys',
        prompt: 'Attorney for Property choices', promptKo: '재산관리 위임자 선택',
        kind: 'personList', required: true, skipIf: (v) => !v.poa.property.requested,
        validate: (value) => validatePrimaryPerson(value, 'attorney for Property'),
      },
      {
        id: 'poa-property-effective', vaultPath: 'poa.property.effective',
        prompt: 'When should the Property POA take effect?', promptKo: '재산관리 위임장은 언제 효력이 발생해야 합니까?',
        kind: 'select', required: true, skipIf: (v) => !v.poa.property.requested,
        options: [
          { label: 'Immediately', labelKo: '즉시', value: 'immediately' },
          { label: 'Only after incapacity is confirmed', labelKo: '무능력이 확인된 후에만', value: 'incapacity' },
          { label: 'I need the lawyer to explain the options', labelKo: '변호사의 설명이 필요함', value: 'unsure' },
        ],
      },
      {
        id: 'poa-property-restrictions', vaultPath: 'poa.property.restrictions',
        prompt: 'Restrictions or special instructions (optional)',
        promptKo: '제한 또는 특별 지침 (선택 사항)', kind: 'textarea',
        skipIf: (v) => !v.poa.property.requested,
      },
      {
        id: 'poa-care', vaultPath: 'poa.personalCare.requested',
        prompt: 'Do you want a Power of Attorney for Personal Care?',
        promptKo: '개인 돌봄 위임장을 원하십니까?', kind: 'boolean', required: true,
      },
      {
        id: 'poa-care-attorneys', vaultPath: 'poa.personalCare.attorneys',
        prompt: 'Attorney for Personal Care choices', promptKo: '개인 돌봄 위임자 선택',
        kind: 'personList', required: true, skipIf: (v) => !v.poa.personalCare.requested,
        validate: (value) => validatePrimaryPerson(value, 'attorney for Personal Care'),
      },
      {
        id: 'poa-care-wishes', vaultPath: 'poa.personalCare.careInstructions',
        prompt: 'Personal-care or health-care wishes (optional)',
        promptKo: '개인 돌봄 또는 의료 관련 희망 (선택 사항)', kind: 'textarea',
        skipIf: (v) => !v.poa.personalCare.requested,
      },
      {
        id: 'poa-organ', vaultPath: 'poa.personalCare.organDonation',
        prompt: 'Do you wish to donate organs or tissue?',
        promptKo: '장기 또는 조직 기증을 원하십니까?', kind: 'boolean',
        skipIf: (v) => !v.poa.personalCare.requested,
      },
    ],
  },
  {
    id: 'final',
    title: 'Final wishes',
    titleKo: '최종 희망 사항',
    icon: '9',
    intro: 'These wishes guide the lawyer and your family but may need separate practical arrangements.',
    introKo: '이 희망 사항은 변호사와 가족에게 지침이 되지만 별도의 실무적 준비가 필요할 수 있습니다.',
    questions: [
      {
        id: 'resting-place', vaultPath: 'finalWishes.restingPlace',
        prompt: 'Burial, cremation, donation, or no preference?',
        promptKo: '매장, 화장, 기증 또는 선호 없음 중 선택해 주세요.', kind: 'select',
        options: [
          { label: 'Burial', labelKo: '매장', value: 'burial' },
          { label: 'Cremation', labelKo: '화장', value: 'cremation' },
          { label: 'Donation', labelKo: '기증', value: 'donation' },
          { label: 'No preference stated', labelKo: '선호 없음', value: 'not_specified' },
        ],
      },
      {
        id: 'ceremony', vaultPath: 'finalWishes.ceremonyWishes',
        prompt: 'Ceremony or memorial wishes (optional)', promptKo: '장례 또는 추모 희망 (선택 사항)',
        kind: 'textarea',
      },
      {
        id: 'pet-care', vaultPath: 'finalWishes.petCare',
        prompt: 'Pet-care wishes (optional)', promptKo: '반려동물 돌봄 희망 (선택 사항)',
        kind: 'textarea',
      },
      {
        id: 'other-concerns', vaultPath: 'finalWishes.otherConcerns',
        prompt: 'Anything else the lawyer should know? (optional)',
        promptKo: '변호사가 알아야 할 기타 사항이 있습니까? (선택 사항)', kind: 'textarea',
      },
    ],
  },
]

function isMinor(dob?: string): boolean {
  if (!dob) return false
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return false
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25) < 18
}

function validateBeneficiaries(value: unknown, method?: WillVault['residueDistribution']): string | null {
  const beneficiaries = Array.isArray(value) ? value : []
  if (!beneficiaries.some((b) => b && typeof b === 'object' && String((b as { fullName?: string }).fullName ?? '').trim())) {
    return 'Add at least one residue beneficiary.'
  }
  if (method !== 'percentages') return null
  const total = beneficiaries.reduce(
    (sum, b) => sum + Number((b as { sharePercent?: number }).sharePercent ?? 0), 0
  )
  return Math.abs(total - 100) < 0.001 ? null : `Beneficiary percentages currently total ${total}%. They must total 100%.`
}

function validatePrimaryPerson(value: unknown, role: string): string | null {
  const people = Array.isArray(value) ? value : []
  return people.some((person) =>
    person && typeof person === 'object' &&
    !(person as { isBackup?: boolean }).isBackup &&
    String((person as { fullName?: string }).fullName ?? '').trim()
  ) ? null : `Add at least one primary ${role}.`
}

export function shouldAsk(q: IntakeQuestion, vault: WillVault): boolean {
  return !q.skipIf?.(vault)
}

export function questionError(q: IntakeQuestion, vault: WillVault): string | null {
  if (!shouldAsk(q, vault)) return null
  const value = getAtPath(vault, q.vaultPath)
  if (q.required && !isFilled(value)) return `${q.prompt} is required.`
  return q.validate?.(value, vault) ?? null
}

export function intakeErrors(vault: WillVault): Array<{ chapterId: string; questionId: string; message: string }> {
  return willIntakeChapters.flatMap((chapter) =>
    chapter.questions.flatMap((question) => {
      const message = questionError(question, vault)
      return message ? [{ chapterId: chapter.id, questionId: question.id, message }] : []
    })
  )
}

export function chapterProgress(
  chapter: IntakeChapter,
  vault: WillVault
): { asked: number; answered: number; pct: number; requiredUnanswered: number } {
  const required = chapter.questions.filter((q) => q.required && shouldAsk(q, vault))
  const answered = required.filter((q) => !questionError(q, vault)).length
  return {
    asked: required.length,
    answered,
    pct: required.length === 0 ? 100 : Math.round((answered / required.length) * 100),
    requiredUnanswered: required.length - answered,
  }
}

function getAtPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj)
}

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.some((item) =>
    typeof item === 'object' && item !== null
      ? Object.values(item).some((part) => typeof part !== 'string' || part.trim() !== '')
      : Boolean(item)
  )
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

export function overallProgress(vault: WillVault): { pct: number; requiredUnanswered: number } {
  let asked = 0
  let answered = 0
  let requiredUnanswered = 0
  for (const chapter of willIntakeChapters) {
    const progress = chapterProgress(chapter, vault)
    asked += progress.asked
    answered += progress.answered
    requiredUnanswered += progress.requiredUnanswered
  }
  return { pct: asked === 0 ? 0 : Math.round((answered / asked) * 100), requiredUnanswered }
}
