/**
 * Central vault for all user-supplied facts behind a will. Intake writes
 * into this shape; the clause editor, applicability engine, and review
 * page read from it. Variables consumed by `{{placeholder}}` substitution
 * are projected out via `vaultToVariables` — keep this shape normalized.
 */

export type MaritalStatus = 'married' | 'common_law' | 'single' | 'divorced' | 'widowed'

export interface VaultTestator {
  fullName?: string
  preferredName?: string
  dob?: string // ISO date
  address?: string
  maritalStatus?: MaritalStatus
  occupation?: string
  citizenship?: string
  email?: string
  phone?: string
}

export interface VaultSpouse {
  fullName?: string
  included?: boolean
  dob?: string
  separated?: boolean
  separationDate?: string
}

export interface VaultChild {
  id: string
  fullName: string
  dob?: string
  fromPriorRelationship?: boolean
  isDependent?: boolean
  receivesODSP?: boolean
  isStepchild?: boolean
}

export interface VaultPerson {
  id: string
  fullName: string
  relationship?: string
  address?: string
  isBackup?: boolean
  outsideOntario?: boolean
}

export interface VaultBeneficiary extends VaultPerson {
  sharePercent?: number
  specificGift?: string
  receivesODSP?: boolean
}

export type VaultGiftType = 'cash' | 'personal_item' | 'real_estate' | 'charity' | 'pet'

export interface VaultGift {
  id: string
  type: VaultGiftType
  description: string
  recipientName?: string
  amount?: number
  charityName?: string
  charityNumber?: string
  condition?: string
  /** Pet-care gifts only: fills {{petName}} / {{petType}} in the pet clause. */
  petName?: string
  petType?: string
}

export type VaultAssetType =
  | 'real_estate'
  | 'bank'
  | 'investment'
  | 'registered_plan'
  | 'insurance'
  | 'business'
  | 'foreign'
  | 'digital'
  | 'other'

export interface VaultAssetItem {
  id: string
  type: VaultAssetType
  description: string
  estimatedValue?: number
  ownership?: 'sole' | 'joint_spouse' | 'joint_other' | 'tenants_in_common'
  hasDesignatedBeneficiary?: boolean
  designatedBeneficiaryName?: string
  outsideCanada?: boolean
}

export interface VaultLiability {
  id: string
  type: 'mortgage' | 'credit' | 'loan' | 'tax' | 'business' | 'other'
  description: string
  estimatedBalance?: number
  jointlyOwed?: boolean
}

export interface VaultAssets {
  items?: VaultAssetItem[]
  liabilities?: VaultLiability[]
  privateCompanyShares?: boolean
  shareholderLoans?: boolean
  lifeInsurance?: boolean
  rrspBeneficiaries?: string
  estimatedNetWorth?: number
}

export interface VaultGoals {
  hasDualWill?: boolean
  dualWillReviewRequested?: boolean
  hasPoaProperty?: boolean
  hasPoaPersonalCare?: boolean
  charitableGiving?: boolean
  henson?: boolean
  minorChildrenTrust?: boolean
  spousalTrust?: boolean
  dualWillUnsure?: boolean
}

export interface VaultPoa {
  property: {
    requested?: boolean
    attorneys: VaultPerson[]
    effective?: 'immediately' | 'incapacity' | 'unsure'
    restrictions?: string
    compensation?: string
  }
  personalCare: {
    requested?: boolean
    attorneys: VaultPerson[]
    lifeSupport?: 'maintain' | 'withhold' | 'attorney_decides' | 'unsure'
    careInstructions?: string
    organDonation?: boolean
  }
}

export interface VaultFinalWishes {
  restingPlace?: 'burial' | 'cremation' | 'donation' | 'not_specified'
  ceremonyWishes?: string
  petCare?: string
  otherConcerns?: string
}

export interface WillVault {
  schemaVersion: 2
  testator: VaultTestator
  spouse?: VaultSpouse
  children: VaultChild[]
  executors: VaultPerson[]
  guardians: VaultPerson[]
  beneficiaries: VaultBeneficiary[]
  contingentBeneficiaries: VaultBeneficiary[]
  gifts: VaultGift[]
  assets: VaultAssets
  goals: VaultGoals
  trustDistributionAge?: number
  corporateTrusteeName?: string
  poa: VaultPoa
  finalWishes: VaultFinalWishes
  residueDistribution?: 'equal' | 'percentages' | 'per_stirpes' | 'lawyer_help'
  /** Express consent to AI processing (#90): recorded before any estate
   *  detail reaches an external AI provider. The form path never needs it. */
  aiConsent?: { accepted: boolean; at: string; version: string }
}

/** Bump when the consent wording changes materially: recorded consent
 *  carries the version the client actually saw (#90). */
export const AI_CONSENT_VERSION = '2026-07-28'

/** Dot-path into the vault, e.g. "testator.fullName" or "children.0.fullName". */
export type VaultPath = string

/** Empty vault used for reset / new-will state. */
export const emptyVault: WillVault = {
  schemaVersion: 2,
  testator: {},
  children: [],
  executors: [],
  guardians: [],
  beneficiaries: [],
  contingentBeneficiaries: [],
  gifts: [],
  assets: { items: [], liabilities: [] },
  goals: {},
  poa: {
    property: { attorneys: [] },
    personalCare: { attorneys: [] },
  },
  finalWishes: {},
}

/** Safely upgrades local/server snapshots created before schema version 2. */
export function normalizeVault(input?: Partial<WillVault> | null): WillVault {
  const source = input ?? {}
  const legacyAssets = source.assets ?? {}
  const requestedProperty = source.poa?.property?.requested ?? source.goals?.hasPoaProperty
  const requestedCare = source.poa?.personalCare?.requested ?? source.goals?.hasPoaPersonalCare
  return {
    ...emptyVault,
    ...source,
    schemaVersion: 2,
    testator: { ...emptyVault.testator, ...(source.testator ?? {}) },
    children: Array.isArray(source.children) ? source.children : [],
    executors: Array.isArray(source.executors) ? source.executors : [],
    guardians: Array.isArray(source.guardians) ? source.guardians : [],
    beneficiaries: Array.isArray(source.beneficiaries) ? source.beneficiaries : [],
    contingentBeneficiaries: Array.isArray(source.contingentBeneficiaries)
      ? source.contingentBeneficiaries
      : [],
    gifts: Array.isArray(source.gifts) ? source.gifts : [],
    assets: {
      ...legacyAssets,
      items: Array.isArray(legacyAssets.items) ? legacyAssets.items : [],
      liabilities: Array.isArray(legacyAssets.liabilities) ? legacyAssets.liabilities : [],
    },
    goals: {
      ...(source.goals ?? {}),
      hasPoaProperty: requestedProperty,
      hasPoaPersonalCare: requestedCare,
    },
    poa: {
      property: {
        ...(source.poa?.property ?? {}),
        requested: requestedProperty,
        attorneys: Array.isArray(source.poa?.property?.attorneys)
          ? source.poa.property.attorneys
          : [],
      },
      personalCare: {
        ...(source.poa?.personalCare ?? {}),
        requested: requestedCare,
        attorneys: Array.isArray(source.poa?.personalCare?.attorneys)
          ? source.poa.personalCare.attorneys
          : [],
      },
    },
    finalWishes: { ...(source.finalWishes ?? {}) },
  }
}
