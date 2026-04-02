import { describe, it, expect } from 'vitest'
import { en } from '@/lib/i18n/en'
import { ko } from '@/lib/i18n/ko'
import { translations, getTranslations } from '@/lib/i18n'

/** Recursively collect all leaf keys from an object as dot-separated paths */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

/** Recursively collect all leaf values */
function collectValues(obj: Record<string, unknown>): string[] {
  const values: string[] = []
  for (const v of Object.values(obj)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      values.push(...collectValues(v as Record<string, unknown>))
    } else if (typeof v === 'string') {
      values.push(v)
    }
  }
  return values
}

describe('i18n — Bilingual Coverage', () => {
  const enKeys = collectKeys(en as unknown as Record<string, unknown>)
  const koKeys = collectKeys(ko as unknown as Record<string, unknown>)

  it('all EN keys exist in KO dictionary', () => {
    const koKeySet = new Set(koKeys)
    const missingInKo: string[] = []
    for (const key of enKeys) {
      if (!koKeySet.has(key)) {
        missingInKo.push(key)
      }
    }
    expect(
      missingInKo,
      `Keys present in EN but missing in KO: ${missingInKo.join(', ')}`
    ).toEqual([])
  })

  it('all KO keys exist in EN dictionary', () => {
    const enKeySet = new Set(enKeys)
    const missingInEn: string[] = []
    for (const key of koKeys) {
      if (!enKeySet.has(key)) {
        missingInEn.push(key)
      }
    }
    expect(
      missingInEn,
      `Keys present in KO but missing in EN: ${missingInEn.join(', ')}`
    ).toEqual([])
  })

  it('no empty string values in EN', () => {
    const values = collectValues(en as unknown as Record<string, unknown>)
    for (const v of values) {
      expect(v.length, `Found empty string in EN translations`).toBeGreaterThan(0)
    }
  })

  it('no empty string values in KO', () => {
    const values = collectValues(ko as unknown as Record<string, unknown>)
    for (const v of values) {
      expect(v.length, `Found empty string in KO translations`).toBeGreaterThan(0)
    }
  })

  it('common keys are present in both languages', () => {
    const requiredKeys = [
      'back', 'continue', 'save', 'cancel',
      'aboutYou', 'yourFamily', 'yourEstate', 'yourArrangements',
      'poaProperty', 'poaPersonalCare',
      'yes', 'no', 'firstName', 'lastName',
      'appName',
    ]
    for (const key of requiredKeys) {
      expect(en).toHaveProperty(key)
      expect(ko).toHaveProperty(key)
    }
  })

  it('translations object exports both languages', () => {
    expect(translations).toHaveProperty('en')
    expect(translations).toHaveProperty('ko')
  })

  it('getTranslations returns correct language', () => {
    const enTrans = getTranslations('en')
    expect(enTrans.appName).toBe('EZWill')
    const koTrans = getTranslations('ko')
    expect(koTrans.appName).toBe('EZWill')
  })
})
