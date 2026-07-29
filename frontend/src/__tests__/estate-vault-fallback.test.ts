/**
 * Vault fallbacks for the client-file estate panels (#87): a vault-only
 * client's beneficiaries and gifts must render even though the legacy
 * your_estate record does not exist.
 */
import { describe, it, expect } from 'vitest'
import {
  vaultBeneficiariesForChart,
  vaultGiftRows,
} from '@/lib/dashboard/estate-vault-fallback'

describe('vaultBeneficiariesForChart', () => {
  it('returns [] for empty or missing vaults', () => {
    expect(vaultBeneficiariesForChart(undefined)).toEqual([])
    expect(vaultBeneficiariesForChart({})).toEqual([])
    expect(vaultBeneficiariesForChart({ beneficiaries: [{ fullName: '   ' }] })).toEqual([])
  })

  it('uses explicit shares when every named beneficiary has one', () => {
    const out = vaultBeneficiariesForChart({
      beneficiaries: [
        { fullName: 'Grace Kim', relationship: 'spouse', sharePercent: 60 },
        { fullName: 'Min Cho', relationship: 'child', sharePercent: 40 },
      ],
    })
    expect(out).toEqual([
      { name: 'Grace Kim', relationship: 'spouse', percentage: 60 },
      { name: 'Min Cho', relationship: 'child', percentage: 40 },
    ])
  })

  it('falls back to an equal split summing to 100 when shares are partial', () => {
    const out = vaultBeneficiariesForChart({
      beneficiaries: [
        { fullName: 'A One', sharePercent: 50 },
        { fullName: 'B Two' },
        { fullName: 'C Three' },
      ],
    })
    expect(out.map((b) => b.percentage)).toEqual([33, 33, 34])
    expect(out.reduce((sum, b) => sum + b.percentage, 0)).toBe(100)
  })
})

describe('vaultGiftRows', () => {
  it('maps vault gifts with inline recipients and skips empty rows', () => {
    const out = vaultGiftRows({
      gifts: [
        { id: 'g1', type: 'cash', description: 'To my niece', recipientName: 'Mina Cho', amount: 5000 },
        { id: 'g2', type: 'charity', description: 'donation', charityName: 'Maple Grove Food Bank' },
        { id: 'g3', type: 'cash', description: '' },
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ recipientName: 'Mina Cho', amount: 5000 })
    expect(out[1]).toMatchObject({ charityName: 'Maple Grove Food Bank' })
  })
})
