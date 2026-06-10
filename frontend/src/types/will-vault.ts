/**
 * Central vault for all user-supplied facts behind a will. Intake writes
 * into this shape; the clause editor, applicability engine, and review
 * page read from it. Variables consumed by `{{placeholder}}` substitution
 * are projected out via `vaultToVariables` — keep this shape normalized.
 */

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

/** Empty vault used for reset / new-will state. */
export const emptyVault: WillVault = {
  testator: {},
  children: [],
  executors: [],
  guardians: [],
  beneficiaries: [],
  assets: {},
  goals: {},
}
