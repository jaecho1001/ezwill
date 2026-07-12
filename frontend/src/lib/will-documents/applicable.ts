/**
 * Clause applicability engine. Reads a clause's `applicableWhen` record
 * against the current vault and returns one of three states:
 *
 *   'yes'      — clause applies and should be auto-included.
 *   'no'       — clause does NOT apply; hide or grey out in the tree.
 *   'unknown'  — the vault fields needed to decide aren't filled yet;
 *                show the clause but flag it so the user knows answers
 *                in intake would sharpen the inclusion decision.
 *
 * Supported flag keys (backward-compatible with existing clause data):
 *   hasSpouse          — vault.spouse?.included && fullName set
 *   hasChildren        — vault.children.length > 0
 *   hasMinorChildren   — at least one child under 18
 *   hasODSPBeneficiary — vault.goals.henson
 *   hasRESP            — vault.assets.lifeInsurance proxy (no direct field) — unknown unless goals.minorChildrenTrust set
 *   isDualWill         — vault.goals.hasDualWill
 */

import type { WillClauseTemplate } from '@/types/will-document'
import type { WillVault } from '@/types/will-vault'
import { resolveJurisdiction } from '@/lib/jurisdictions/registry'

export type Applicability = 'yes' | 'no' | 'unknown'

export function isClauseApplicable(clause: WillClauseTemplate, vault: WillVault): Applicability {
  const rule = clause.applicableWhen as Record<string, unknown> | undefined
  if (!rule || Object.keys(rule).length === 0) return 'yes'

  let anyUnknown = false
  for (const [key, expected] of Object.entries(rule)) {
    const actual = evaluateFlag(key, vault)
    if (actual === 'unknown') {
      anyUnknown = true
      continue
    }
    if (actual !== expected) return 'no'
  }
  return anyUnknown ? 'unknown' : 'yes'
}

function evaluateFlag(key: string, v: WillVault): boolean | 'unknown' {
  switch (key) {
    case 'hasSpouse': {
      if (v.testator.maritalStatus === undefined) return 'unknown'
      if (v.testator.maritalStatus === 'single') return false
      return !!(v.spouse?.included && v.spouse.fullName)
    }
    case 'hasChildren':
      return v.children.length > 0 ? true : v.children.length === 0 ? false : 'unknown'
    case 'hasMinorChildren':
      if (v.children.length === 0) return false
      return v.children.some((c) => isMinor(c.dob))
    case 'hasODSPBeneficiary':
      if (v.goals.henson === undefined) return 'unknown'
      return !!v.goals.henson
    case 'hasRESP':
      // No direct vault field yet — treat as unknown unless explicitly false.
      return 'unknown'
    case 'isDualWill':
      if (v.goals.hasDualWill === undefined) return 'unknown'
      return !!v.goals.hasDualWill
    default:
      // Unknown flag name — don't block inclusion.
      return 'unknown'
  }
}

function isMinor(dob?: string, province?: string): boolean {
  if (!dob) return false
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return false
  const years = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  // Age of majority comes from the jurisdiction registry (18 in ON, 19 in BC…),
  // so a future province is a config change, not an edit here.
  return years < resolveJurisdiction(province).ageOfMajority
}
