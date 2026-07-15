import { describe, it, expect } from 'vitest'
import {
  resolveJurisdiction,
  getJurisdiction,
  DEFAULT_JURISDICTION_CODE,
  supportedJurisdictionCodes,
} from '@/lib/jurisdictions/registry'

describe('jurisdiction registry', () => {
  it('resolves Ontario aliases to CA-ON', () => {
    for (const p of [undefined, null, '', 'ON', 'on', 'Ontario', 'ontario', 'CA-ON']) {
      expect(resolveJurisdiction(p).code).toBe('CA-ON')
      expect(resolveJurisdiction(p).name).toBe('Ontario')
    }
  })
  it('defaults unknown provinces to Ontario', () => {
    expect(resolveJurisdiction('Atlantis').code).toBe(DEFAULT_JURISDICTION_CODE)
  })
  it('exposes Ontario constants (age of majority 18)', () => {
    expect(getJurisdiction('CA-ON').ageOfMajority).toBe(18)
    expect(getJurisdiction('CA-ON').estateTrusteeTerm).toBe('Estate Trustee')
  })
  it('lists Ontario as supported', () => {
    expect(supportedJurisdictionCodes()).toContain('CA-ON')
  })
})
