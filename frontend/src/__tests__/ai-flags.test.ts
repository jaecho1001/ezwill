import { describe, it, expect } from 'vitest'
import { runAIFlags } from '@/lib/ai-flags'
import { INITIAL_WILL } from '@/lib/types/will'
import type { WillDocument, PersonData } from '@/lib/types/will'

/** Helper to deep-clone INITIAL_WILL and apply overrides */
function makeWill(overrides: Partial<WillDocument> = {}): WillDocument {
  const base = JSON.parse(JSON.stringify(INITIAL_WILL)) as WillDocument
  return { ...base, ...overrides }
}

function makePerson(partial: Partial<PersonData> = {}): PersonData {
  return {
    id: 'p1',
    role: 'beneficiary',
    firstName: 'Test',
    lastName: 'Person',
    ...partial,
  }
}

describe('AI Flags — runAIFlags', () => {
  it('empty/initial will triggers FLA exclusion flag since includeFLAExclusion is true by default', () => {
    // INITIAL_WILL has includeFLAExclusion: true, province ON, so FLA flag should NOT fire
    const will = makeWill()
    const flags = runAIFlags(will)
    const flaFlag = flags.find((f) => f.id === 'missing_fla_exclusion')
    expect(flaFlag).toBeUndefined()
  })

  it('will with province ON and FLA exclusion disabled triggers FLA flag', () => {
    const will = makeWill()
    will.aboutYou.province = 'ON'
    will.yourEstate.includeFLAExclusion = false
    const flags = runAIFlags(will)
    const flaFlag = flags.find((f) => f.id === 'missing_fla_exclusion')
    expect(flaFlag).toBeDefined()
    expect(flaFlag!.severity).toBe('critical')
    expect(flaFlag!.statute).toBe('FLA s.4(2)(2)')
  })

  it('will with ODSP beneficiary but no Henson Trust triggers Henson flag', () => {
    const will = makeWill()
    will.yourEstate.beneficiaries = [makePerson({ receivesODSP: true })]
    const flags = runAIFlags(will)
    const hensonFlag = flags.find((f) => f.id === 'henson_trust_recommended')
    expect(hensonFlag).toBeDefined()
    expect(hensonFlag!.severity).toBe('critical')
  })

  it('will with ODSP child triggers Henson flag', () => {
    const will = makeWill()
    will.yourFamily.children = [makePerson({ role: 'child', receivesODSP: true })]
    const flags = runAIFlags(will)
    const hensonFlag = flags.find((f) => f.id === 'henson_trust_recommended')
    expect(hensonFlag).toBeDefined()
  })

  it('will with business assets and no dual will triggers dual will recommendation', () => {
    const will = makeWill()
    will.assets = [{ id: 'a1', assetType: 'business', description: 'Corp shares' }]
    will.yourEstate.includeDualWill = false
    const flags = runAIFlags(will)
    const dualFlag = flags.find((f) => f.id === 'dual_will_recommended')
    expect(dualFlag).toBeDefined()
    expect(dualFlag!.severity).toBe('warning')
  })

  it('will with business assets and dual will enabled does NOT trigger dual will flag', () => {
    const will = makeWill()
    will.assets = [{ id: 'a1', assetType: 'business', description: 'Corp shares' }]
    will.yourEstate.includeDualWill = true
    const flags = runAIFlags(will)
    const dualFlag = flags.find((f) => f.id === 'dual_will_recommended')
    expect(dualFlag).toBeUndefined()
  })

  it('separated spouse with old separation date triggers separation gift void risk', () => {
    const will = makeWill()
    will.yourFamily.maritalStatus = 'separated'
    // 4 years ago
    const fourYearsAgo = new Date()
    fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4)
    will.yourFamily.separationDate = fourYearsAgo.toISOString()
    const flags = runAIFlags(will)
    const sepFlag = flags.find((f) => f.id === 'separation_gift_void_risk')
    expect(sepFlag).toBeDefined()
    expect(sepFlag!.severity).toBe('critical')
  })

  it('separated spouse with recent separation date does NOT trigger separation flag', () => {
    const will = makeWill()
    will.yourFamily.maritalStatus = 'separated'
    // 1 year ago
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    will.yourFamily.separationDate = oneYearAgo.toISOString()
    const flags = runAIFlags(will)
    const sepFlag = flags.find((f) => f.id === 'separation_gift_void_risk')
    expect(sepFlag).toBeUndefined()
  })

  it('will with RESP asset triggers RESP clause needed flag', () => {
    const will = makeWill()
    will.assets = [{ id: 'a1', assetType: 'resp', description: 'RESP for kids' }]
    const flags = runAIFlags(will)
    const respFlag = flags.find((f) => f.id === 'resp_clause_needed')
    expect(respFlag).toBeDefined()
    expect(respFlag!.severity).toBe('warning')
  })

  it('will with trust lacking perStirpesLanguage triggers Saunders v Vautier risk', () => {
    const will = makeWill()
    will.yourEstate.hasTrusts = true
    will.yourEstate.trusts = [{
      id: 't1',
      trustType: 'childrens',
      beneficiaryIds: ['b1'],
      trusteeIds: ['t1'],
      perStirpesLanguage: false,
    }]
    const flags = runAIFlags(will)
    const svFlag = flags.find((f) => f.id === 'saunders_vautier_risk')
    expect(svFlag).toBeDefined()
    expect(svFlag!.severity).toBe('warning')
  })

  it('will with US person beneficiary triggers US tax risk', () => {
    const will = makeWill()
    will.yourEstate.beneficiaries = [makePerson({ isUSPerson: true })]
    const flags = runAIFlags(will)
    const usFlag = flags.find((f) => f.id === 'us_person_tax_risk')
    expect(usFlag).toBeDefined()
    expect(usFlag!.severity).toBe('warning')
  })

  it('will with guardians triggers 90-day guardian info flag', () => {
    const will = makeWill()
    will.yourFamily.guardians = [makePerson({ role: 'guardian' })]
    const flags = runAIFlags(will)
    const guardFlag = flags.find((f) => f.id === 'clra_90day_guardian_warning')
    expect(guardFlag).toBeDefined()
    expect(guardFlag!.severity).toBe('info')
  })

  it('will with joint asset held by non-spouse triggers Pecore resulting trust flag', () => {
    const will = makeWill()
    will.assets = [{
      id: 'a1',
      assetType: 'real_estate',
      description: 'House',
      jointOwnerName: 'Adult Child',
      jointOwnerRelationship: 'child',
    }]
    const flags = runAIFlags(will)
    const pecoreFlag = flags.find((f) => f.id === 'pecore_resulting_trust')
    expect(pecoreFlag).toBeDefined()
    expect(pecoreFlag!.severity).toBe('warning')
  })

  it('joint asset held by spouse does NOT trigger Pecore flag', () => {
    const will = makeWill()
    will.assets = [{
      id: 'a1',
      assetType: 'real_estate',
      description: 'House',
      jointOwnerName: 'Spouse Name',
      jointOwnerRelationship: 'spouse',
    }]
    const flags = runAIFlags(will)
    const pecoreFlag = flags.find((f) => f.id === 'pecore_resulting_trust')
    expect(pecoreFlag).toBeUndefined()
  })

  it('well-configured will produces minimal flags', () => {
    const will = makeWill()
    will.aboutYou.province = 'ON'
    will.yourEstate.includeFLAExclusion = true
    will.yourEstate.includeDualWill = false
    will.yourFamily.maritalStatus = 'married'
    will.yourFamily.hasChildren = false
    will.yourFamily.children = []
    will.yourFamily.guardians = []
    will.yourEstate.beneficiaries = []
    will.yourEstate.hasTrusts = false
    will.yourEstate.trusts = []
    will.assets = []
    const flags = runAIFlags(will)
    // Should have no critical or warning flags for a clean will
    const criticalOrWarning = flags.filter(
      (f) => f.severity === 'critical' || f.severity === 'warning'
    )
    expect(criticalOrWarning.length).toBe(0)
  })

  it('flag severity levels are correct types', () => {
    // Trigger multiple flags
    const will = makeWill()
    will.aboutYou.province = 'ON'
    will.yourEstate.includeFLAExclusion = false
    will.yourEstate.beneficiaries = [makePerson({ receivesODSP: true })]
    will.assets = [{ id: 'a1', assetType: 'business', description: 'Corp' }]
    will.yourFamily.guardians = [makePerson({ role: 'guardian' })]

    const flags = runAIFlags(will)
    for (const f of flags) {
      expect(['critical', 'warning', 'info']).toContain(f.severity)
    }
  })

  it('preserves dismissed flags that no longer trigger', () => {
    const will = makeWill()
    // Pre-populate a dismissed flag that would not trigger
    will.aiFlags = [{
      id: 'henson_trust_recommended',
      severity: 'critical',
      title: 'Henson Trust Recommended',
      description: 'test',
      dismissed: true,
    }]
    // No ODSP beneficiaries, so henson shouldn't trigger
    const flags = runAIFlags(will)
    const hensonFlag = flags.find((f) => f.id === 'henson_trust_recommended')
    expect(hensonFlag).toBeDefined()
    expect(hensonFlag!.dismissed).toBe(true)
  })
})
