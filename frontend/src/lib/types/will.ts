// Ontario-specific types for will building
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
