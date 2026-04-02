export interface StepConfig {
  id: number
  key: string
  path: string
  title: string
  titleKo: string
  description: string
  descriptionKo: string
  icon: string
  subSteps: SubStepConfig[]
}

export interface SubStepConfig {
  id: number
  key: string
  title: string
  titleKo: string
  required: boolean
  dependsOn?: { field: string; value: unknown }
}

export const WILL_STEPS: StepConfig[] = [
  {
    id: 1, key: 'about-you', path: '/will/about-you',
    title: 'About You', titleKo: '귀하에 대하여',
    description: 'Basic personal information', descriptionKo: '기본 개인 정보',
    icon: '👤',
    subSteps: [
      { id: 1, key: 'legal-name', title: 'Legal Name', titleKo: '법적 이름', required: true },
      { id: 2, key: 'dob', title: 'Date of Birth', titleKo: '생년월일', required: true },
      { id: 3, key: 'location', title: 'Province & City', titleKo: '주 및 도시', required: true },
      { id: 4, key: 'contact', title: 'Contact Info', titleKo: '연락처 정보', required: false },
    ]
  },
  {
    id: 2, key: 'your-family', path: '/will/your-family',
    title: 'Your Family', titleKo: '귀하의 가족',
    description: 'Spouse, children, and guardians', descriptionKo: '배우자, 자녀 및 후견인',
    icon: '👨‍👩‍👧‍👦',
    subSteps: [
      { id: 1, key: 'marital-status', title: 'Marital Status', titleKo: '혼인 상태', required: true },
      { id: 2, key: 'spouse', title: 'Spouse or Partner', titleKo: '배우자 또는 파트너', required: false, dependsOn: { field: 'yourFamily.hasSpouse', value: true } },
      { id: 3, key: 'children', title: 'Children', titleKo: '자녀', required: true },
      { id: 4, key: 'guardians', title: 'Guardians', titleKo: '후견인', required: false, dependsOn: { field: 'yourFamily.hasChildren', value: true } },
      { id: 5, key: 'pets', title: 'Pets', titleKo: '반려동물', required: false },
    ]
  },
  {
    id: 3, key: 'your-estate', path: '/will/your-estate',
    title: 'Your Estate', titleKo: '귀하의 유산',
    description: 'Gifts, donations, and beneficiaries', descriptionKo: '증여, 기부 및 수혜자',
    icon: '🏛️',
    subSteps: [
      { id: 1, key: 'specific-gifts', title: 'Specific Gifts', titleKo: '특정 증여', required: false },
      { id: 2, key: 'donations', title: 'Charitable Donations', titleKo: '자선 기부', required: false },
      { id: 3, key: 'beneficiaries', title: 'Beneficiaries', titleKo: '수혜자', required: true },
      { id: 4, key: 'distribution', title: 'Distribution', titleKo: '분배 방식', required: true },
      { id: 5, key: 'minor-trust', title: 'Children\'s Trust Age', titleKo: '자녀 신탁 나이', required: false },
      { id: 6, key: 'ontario-clauses', title: 'Ontario Protections', titleKo: '온타리오 보호 조항', required: false },
    ]
  },
  {
    id: 4, key: 'your-arrangements', path: '/will/your-arrangements',
    title: 'Your Arrangements', titleKo: '귀하의 사후 계획',
    description: 'Executor and final wishes', descriptionKo: '유언 집행인 및 최후 소원',
    icon: '📋',
    subSteps: [
      { id: 1, key: 'executor', title: 'Executor', titleKo: '유언 집행인', required: true },
      { id: 2, key: 'backup-executors', title: 'Backup Executors', titleKo: '대체 집행인', required: false },
      { id: 3, key: 'resting-place', title: 'Resting Place', titleKo: '안장 장소', required: false },
      { id: 4, key: 'ceremony', title: 'Ceremony Wishes', titleKo: '장례 소원', required: false },
    ]
  },
  {
    id: 5, key: 'poa-property', path: '/will/poa-property',
    title: 'Power of Attorney — Property', titleKo: '재산 관리 위임장',
    description: 'Who manages your finances if incapacitated', descriptionKo: '무능력 시 재정 관리인',
    icon: '🏠',
    subSteps: [
      { id: 1, key: 'poa-property-attorney', title: 'Attorney for Property', titleKo: '재산 관리 위임자', required: true },
      { id: 2, key: 'poa-property-effective', title: 'When Effective', titleKo: '효력 발생 시점', required: true },
      { id: 3, key: 'poa-property-restrictions', title: 'Restrictions', titleKo: '제한 사항', required: false },
    ]
  },
  {
    id: 6, key: 'poa-personal-care', path: '/will/poa-personal-care',
    title: 'Power of Attorney — Personal Care', titleKo: '개인 돌봄 위임장',
    description: 'Who makes health decisions for you', descriptionKo: '건강 관련 결정권자',
    icon: '❤️',
    subSteps: [
      { id: 1, key: 'poa-care-attorney', title: 'Attorney for Personal Care', titleKo: '개인 돌봄 위임자', required: true },
      { id: 2, key: 'poa-care-wishes', title: 'Health Care Wishes', titleKo: '의료 소원', required: false },
      { id: 3, key: 'organ-donation', title: 'Organ Donation', titleKo: '장기 기증', required: false },
    ]
  },
  {
    id: 7, key: 'assets', path: '/will/assets',
    title: 'Your Assets', titleKo: '귀하의 자산',
    description: 'Inventory of your estate', descriptionKo: '자산 목록',
    icon: '💰',
    subSteps: [
      { id: 1, key: 'real-estate', title: 'Real Estate', titleKo: '부동산', required: false },
      { id: 2, key: 'financial', title: 'Financial Assets', titleKo: '금융 자산', required: false },
      { id: 3, key: 'business', title: 'Business Interests', titleKo: '사업 지분', required: false },
      { id: 4, key: 'other-assets', title: 'Other Assets', titleKo: '기타 자산', required: false },
    ]
  },
]
