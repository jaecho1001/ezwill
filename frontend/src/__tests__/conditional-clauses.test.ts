/**
 * Data-conditional default clauses (issue #84).
 *
 * Gift, Henson, spousal-trust and RESP clauses were included by default even
 * when the client supplied no matching data — guaranteeing an unresolved-
 * placeholder rejection on every generation ("a complete intake could not
 * deliver 7 of 9 document types"). Defaults must follow the data; a stored
 * row (the lawyer's explicit choice) must always win.
 */
import { describe, it, expect } from 'vitest'
import {
  DATA_CONDITIONAL_CLAUSES,
  mergeSelectionsWithDefaults,
  supportedConditionalClauseIds,
} from '@/lib/will-documents/index'

const EMPTY_DRAFT = { vault: {} }

const RICH_DRAFT = {
  vault: {
    gifts: [
      { id: 'g1', type: 'personal_item', description: "mother's ring", recipientName: 'Grace Kim' },
      { id: 'g2', type: 'cash', amount: 5000, recipientName: 'Min Cho' },
      { id: 'g3', type: 'charity', description: 'gift', charityName: 'SickKids' },
    ],
    goals: { henson: true, spousalTrust: true },
    children: [],
    assets: { items: [{ id: 'a1', type: 'registered_plan', description: 'RESP' }] },
  },
}

describe('supportedConditionalClauseIds', () => {
  it('supports nothing on an empty draft', () => {
    expect([...supportedConditionalClauseIds(EMPTY_DRAFT)]).toEqual([])
  })

  it('supports each clause exactly when its data exists', () => {
    const supported = supportedConditionalClauseIds(RICH_DRAFT)
    for (const id of DATA_CONDITIONAL_CLAUSES) {
      expect(supported.has(id), id).toBe(true)
    }
  })

  it('a vault gift without a recipient does NOT support the item clause', () => {
    const supported = supportedConditionalClauseIds({
      vault: { gifts: [{ id: 'g', type: 'personal_item', description: 'ring' }] },
    })
    expect(supported.has('gifts-item')).toBe(false)
  })

  it('legacy answers count too (ODSP child, legacy donations, RESP row)', () => {
    const supported = supportedConditionalClauseIds({
      vault: { children: [{ id: 'c', fullName: 'A', receivesODSP: true }] },
      your_estate: { donations: [{ id: 'd', charityName: 'United Way' }] },
      assets: [{ asset_type: 'resp', description: 'RESP acct' }],
    })
    expect(supported.has('trust-henson')).toBe(true)
    expect(supported.has('gifts-charity')).toBe(true)
    expect(supported.has('powers-resp')).toBe(true)
  })
})

describe('mergeSelectionsWithDefaults with data support', () => {
  it('defaults conditional clauses OFF when unsupported', () => {
    const merged = mergeSelectionsWithDefaults(
      'single_will', [], new Set(), supportedConditionalClauseIds(EMPTY_DRAFT),
    )
    const byId = new Map(merged.map((clause) => [clause.clauseId, clause]))
    expect(byId.get('gifts-item')?.included).toBe(false)
    expect(byId.get('gifts-cash')?.included).toBe(false)
    expect(byId.get('gifts-charity')?.included).toBe(false)
    // Unconditional defaults stay on.
    expect(byId.get('rev-single')?.included).toBe(true)
  })

  it('defaults conditional clauses ON when the data exists', () => {
    const merged = mergeSelectionsWithDefaults(
      'single_will', [], new Set(), supportedConditionalClauseIds(RICH_DRAFT),
    )
    const byId = new Map(merged.map((clause) => [clause.clauseId, clause]))
    expect(byId.get('gifts-item')?.included).toBe(true)
    expect(byId.get('gifts-charity')?.included).toBe(true)
  })

  it("a stored row — the lawyer's explicit choice — always wins", () => {
    const merged = mergeSelectionsWithDefaults(
      'single_will',
      [{ clauseId: 'gifts-item', included: true, sortOrder: 5, section: 'Gifts', aiGenerated: false }],
      new Set(),
      supportedConditionalClauseIds(EMPTY_DRAFT),
    )
    const byId = new Map(merged.map((clause) => [clause.clauseId, clause]))
    expect(byId.get('gifts-item')?.included).toBe(true)
  })

  it('passing null preserves the old unconditional behaviour', () => {
    const merged = mergeSelectionsWithDefaults('single_will', [], new Set(), null)
    const byId = new Map(merged.map((clause) => [clause.clauseId, clause]))
    expect(byId.get('gifts-item')?.included).toBe(true)
  })
})
