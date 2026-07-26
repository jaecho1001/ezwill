/**
 * Flatten a WillVault into the `{{placeholder}}` map consumed by
 * resolveTemplateText + document_generator.py. Keeping this in one place
 * means adding a new placeholder to a template requires a single edit
 * here to connect it to vault data.
 */

import type { WillVault } from '@/types/will-vault'

export function vaultToVariables(vault: WillVault): Record<string, string> {
  const v: Record<string, string> = {}

  // ── Testator ──────────────────────────────────────────────
  if (vault.testator.fullName) v.testatorFullName = vault.testator.fullName
  if (vault.testator.address) {
    v.city = extractCity(vault.testator.address)
    v.cityName = v.city
    v.province = extractProvince(vault.testator.address) || 'Ontario'
  }

  // ── Spouse ────────────────────────────────────────────────
  if (vault.spouse?.included && vault.spouse.fullName) {
    v.spouseFullName = vault.spouse.fullName
  }

  // ── Children ──────────────────────────────────────────────
  if (vault.children.length > 0) {
    v.childNames = listNames(vault.children.map((c) => c.fullName))
  }

  // ── Executors / Trustees ──────────────────────────────────
  const primaryExec = vault.executors.find((e) => !e.isBackup)
  const backupExec = vault.executors.find((e) => e.isBackup)
  if (primaryExec) v.primaryExecutorFullName = primaryExec.fullName
  if (backupExec) v.backupExecutorFullName = backupExec.fullName
  v.trusteeTitle = 'Trustee'

  // ── Guardians ─────────────────────────────────────────────
  const primaryGuardian = vault.guardians.find((g) => !g.isBackup)
  if (primaryGuardian) v.primaryGuardianFullName = primaryGuardian.fullName
  if (vault.corporateTrusteeName) v.corporateTrusteeName = vault.corporateTrusteeName

  // ── Beneficiaries / gifts ─────────────────────────────────
  const firstBeneficiary = vault.beneficiaries.find((b) => b.fullName)
  if (firstBeneficiary) {
    v.recipientFullName = firstBeneficiary.fullName
    v.recipientFirstName = firstBeneficiary.fullName.split(/\s+/)[0]
  }
  const firstGift = vault.gifts.find((gift) => gift.description || gift.charityName)
  if (firstGift) {
    if (firstGift.description) v.giftDescription = firstGift.description
    if (firstGift.amount != null) v.cashAmount = formatCurrency(firstGift.amount)
    if (firstGift.charityName) v.charityName = firstGift.charityName
    if (firstGift.charityNumber) v.charityNumber = firstGift.charityNumber
  }

  // ── Powers of attorney ─────────────────────────────────────
  const propertyAttorney = vault.poa.property.attorneys.find((person) => !person.isBackup)
  const careAttorney = vault.poa.personalCare.attorneys.find((person) => !person.isBackup)
  if (propertyAttorney) v.poaPropertyAttorneyFullName = propertyAttorney.fullName
  if (careAttorney) v.poaCareAttorneyFullName = careAttorney.fullName

  // ── Goals-derived defaults ────────────────────────────────
  v.willType = vault.goals.hasDualWill ? 'Probate Will' : 'Last Will and Testament'
  v.otherWillType = vault.goals.hasDualWill ? 'Non-Probate Will' : ''

  // ── Conservative defaults (can be overridden in the editor) ──
  v.survivalDays = v.survivalDays ?? '30'
  v.trustDistributionAge = v.trustDistributionAge ?? '25'
  if (vault.trustDistributionAge) v.trustDistributionAge = String(vault.trustDistributionAge)
  v.dateOfWill = formatToday()

  return v
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value)
}

function extractCity(addr: string): string {
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? ''
}

function extractProvince(addr: string): string {
  const match = addr.match(/\b(Ontario|ON|Quebec|QC|British Columbia|BC|Alberta|AB|Manitoba|MB|Saskatchewan|SK|Nova Scotia|NS|New Brunswick|NB|Newfoundland|NL|Prince Edward Island|PE|PEI)\b/i)
  if (!match) return ''
  const raw = match[1]
  const upper = raw.toUpperCase()
  if (upper === 'ON' || raw.toLowerCase() === 'ontario') return 'Ontario'
  return raw
}

function listNames(names: string[]): string {
  const clean = names.filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`
}

function formatToday(): string {
  const d = new Date()
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
}
