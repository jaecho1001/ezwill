/**
 * Single source for client-facing legal statements (#85, ask 2).
 *
 * These tests pin two things: (1) the statements themselves stay legally
 * coherent — two witnesses everywhere, the ONLY one-witness mention being
 * the SLRA s.21.1 LSO-licensee remote rule (#85's original defect was a
 * screen claiming one witness); (2) the i18n dictionaries actually render
 * from this module, so a screen cannot drift from the lawyer-approved set.
 */
import { describe, it, expect } from 'vitest'
import { LEGAL_STATEMENTS, legalStatement } from '@/lib/legal-statements'
import { en } from '@/lib/i18n/en'
import { ko } from '@/lib/i18n/ko'

describe('LEGAL_STATEMENTS', () => {
  it('every statement has non-empty English and Korean text', () => {
    for (const [key, statement] of Object.entries(LEGAL_STATEMENTS)) {
      expect(statement.en.trim().length, key).toBeGreaterThan(0)
      expect(statement.ko.trim().length, key).toBeGreaterThan(0)
    }
  })

  it('never claims one-witness signing except the SLRA s.21.1 remote rule', () => {
    for (const [key, statement] of Object.entries(LEGAL_STATEMENTS)) {
      if (key === 'signingRemoteOption') continue
      expect(/\bone witness\b|\b1 witness\b/i.test(statement.en), key).toBe(false)
      expect(/1\s*명의\s*증인/.test(statement.ko), key).toBe(false)
    }
    expect(LEGAL_STATEMENTS.signingRemoteOption.en).toContain('LSO licensee')
  })

  it('witness-count statements say two witnesses in both languages', () => {
    for (const key of ['willSigningInPerson', 'poaSigningWitnesses', 'documentsSignedInPerson', 'willTwoWitnesses'] as const) {
      expect(/2 witnesses|two witnesses/i.test(LEGAL_STATEMENTS[key].en), key).toBe(true)
      expect(/2\s*명의 증인|두 명의 증인/.test(LEGAL_STATEMENTS[key].ko), key).toBe(true)
    }
  })

  it('the i18n dictionaries render from this module, not their own copies', () => {
    expect(en.review_nextStep3).toBe(LEGAL_STATEMENTS.willSigningInPerson.en)
    expect(en.review_nextStep4).toBe(LEGAL_STATEMENTS.poaSigningWitnesses.en)
    expect(en.family_separationNote).toBe(LEGAL_STATEMENTS.separatedSpouseGiftsNote.en)
    expect(ko.review_nextStep3).toBe(LEGAL_STATEMENTS.willSigningInPerson.ko)
    expect(ko.review_nextStep4).toBe(LEGAL_STATEMENTS.poaSigningWitnesses.ko)
    expect(ko.family_separationNote).toBe(LEGAL_STATEMENTS.separatedSpouseGiftsNote.ko)
  })

  it('legalStatement() resolves by language', () => {
    expect(legalStatement('willTwoWitnesses', 'en')).toContain('two witnesses')
    expect(legalStatement('willTwoWitnesses', 'ko')).toContain('두 명의 증인')
  })
})
