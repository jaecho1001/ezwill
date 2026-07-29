import type { WillVault } from '@/types/will-vault'

export interface VaultReviewFlag {
  id: string
  severity: 'warning' | 'critical'
  title: string
  description: string
  statute?: string
}

/** Deterministic issue-spotting only. A lawyer decides the legal response. */
export function getVaultReviewFlags(vault: WillVault): VaultReviewFlag[] {
  const flags: VaultReviewFlag[] = []
  if (vault.spouse?.separated) {
    flags.push({
      id: 'vault-separated',
      severity: 'critical',
      title: 'Separation facts require lawyer review',
      description: 'Confirm dates, agreements, relationship status, and the intended treatment of the spouse before drafting.',
      statute: 'SLRA / FLA',
    })
  }
  if (vault.children.some((child) => child.fromPriorRelationship || child.isStepchild)) {
    flags.push({
      id: 'vault-blended-family',
      severity: 'warning',
      title: 'Blended-family planning',
      description: 'Review spouse, child, stepchild, dependant-support, and contingent distribution intentions.',
      statute: 'SLRA / FLA',
    })
  }
  if (vault.children.some((child) => child.receivesODSP) ||
      vault.beneficiaries.some((person) => person.receivesODSP) ||
      vault.goals.henson) {
    flags.push({
      id: 'vault-odsp',
      severity: 'critical',
      title: 'Means-tested-benefit beneficiary',
      description: 'Assess whether Henson-trust or other disability-benefit planning is appropriate. Do not auto-select it.',
      statute: 'ODSPA',
    })
  }
  if (vault.assets.privateCompanyShares || vault.goals.dualWillReviewRequested) {
    flags.push({
      id: 'vault-dual-will',
      severity: 'warning',
      title: 'Dual-will assessment requested',
      description: 'Confirm the asset ownership and corporate records before deciding whether primary and secondary wills are appropriate.',
      statute: 'EAT Act',
    })
  }
  if (vault.assets.items?.some((asset) => asset.type === 'foreign' || asset.outsideCanada)) {
    flags.push({
      id: 'vault-foreign-asset',
      severity: 'critical',
      title: 'Foreign property or cross-border issue',
      description: 'Confirm foreign situs, citizenship, tax residence, and whether local counsel is required.',
    })
  }
  if (vault.executors.some((person) => person.outsideOntario)) {
    flags.push({
      id: 'vault-foreign-executor',
      severity: 'warning',
      title: 'Executor may live outside Ontario',
      description: 'Review practical administration, tax residency, and possible probate-bond implications.',
    })
  }
  if (vault.poa.property.requested && vault.poa.property.effective === 'unsure') {
    flags.push({
      id: 'vault-poa-timing',
      severity: 'warning',
      title: 'Property POA timing needs advice',
      description: 'Explain immediate versus incapacity-triggered authority and confirm the client’s instructions.',
      statute: 'SDA',
    })
  }
  if (vault.gifts.some((gift) => gift.type === 'charity')) {
    flags.push({
      id: 'vault-charity-gift',
      severity: 'warning',
      title: 'Charitable gift needs lawyer drafting',
      description: 'The charity clause offers a fixed sum OR a percentage of residue — the lawyer must choose the form, confirm the CRA registration, and include the clause. It is off by default.',
    })
  }
  if (vault.gifts.some((gift) => gift.type === 'pet')) {
    flags.push({
      id: 'vault-pet-gift',
      severity: 'warning',
      title: 'Pet-care gift needs the pet clause',
      description: 'Pet-care gifts are not rendered by the generic gift clause (the care fund would be dropped). Add the pet-care clause in the Will Editor; the pet name, caregiver, and amount are pre-filled from the intake.',
    })
  }
  if (vault.poa.property.restrictions?.trim()) {
    flags.push({
      id: 'vault-poa-restrictions',
      severity: 'warning',
      title: 'Property-POA restrictions requested',
      description: 'The client asked to limit the property attorney’s authority. The restrictions clause is OFF by default because its terms (including any consent person) must be drafted by the lawyer from the client’s wording.',
      statute: 'SDA',
    })
  }
  return flags
}
