import { describe, it, expect } from 'vitest'
import {
  willDocumentTypes,
  getClausesForDocumentType,
  buildDefaultSelections,
  mergeSelectionsWithDefaults,
  getClauseTree,
  resolveTemplateText,
  getClauseTemplate,
  determineRequiredDocuments,
  getDocumentTypeConfig,
} from '@/lib/will-documents/index'

describe('getClausesForDocumentType', () => {
  it('returns clauses with documentType "single_will" or "all"', () => {
    const clauses = getClausesForDocumentType('single_will')
    for (const c of clauses) {
      expect(['single_will', 'all']).toContain(c.documentType)
    }
    expect(clauses.length).toBeGreaterThan(0)
  })

  it('short-form will reuses single_will and all clauses', () => {
    const clauses = getClausesForDocumentType('simple_will_short')
    for (const c of clauses) {
      expect(['simple_will_short', 'single_will', 'all']).toContain(c.documentType)
    }
    expect(clauses.length).toBeGreaterThan(0)
  })

  it('includes probate-specific clauses for probate_will', () => {
    const clauses = getClausesForDocumentType('probate_will')
    const probateOnly = clauses.filter((c) => c.documentType === 'probate_will')
    expect(probateOnly.length).toBeGreaterThan(0)
  })

  it('includes non-probate-specific clauses for non_probate_will', () => {
    const clauses = getClausesForDocumentType('non_probate_will')
    const npOnly = clauses.filter((c) => c.documentType === 'non_probate_will')
    expect(npOnly.length).toBeGreaterThan(0)
  })
})

describe('buildDefaultSelections', () => {
  it('returns SelectedWillClause[] with correct structure for single_will', () => {
    const selections = buildDefaultSelections('single_will')
    expect(selections.length).toBeGreaterThan(0)
    for (const s of selections) {
      expect(s).toHaveProperty('clauseId')
      expect(s).toHaveProperty('section')
      expect(s).toHaveProperty('included')
      expect(s).toHaveProperty('aiGenerated')
      expect(s).toHaveProperty('sortOrder')
    }
  })

  it('has all clauses included=true by default', () => {
    const selections = buildDefaultSelections('single_will')
    for (const s of selections) {
      expect(s.included).toBe(true)
    }
  })

  it('short-form will has a compact default clause set', () => {
    const shortSelections = buildDefaultSelections('simple_will_short')
    const standardSelections = buildDefaultSelections('single_will')

    expect(shortSelections.length).toBeLessThan(standardSelections.length)
    expect(shortSelections.map((s) => s.clauseId)).toEqual([
      'rev', 'rev-single',
      'appt', 'appt-primary', 'appt-backup',
      'debt', 'debt-payment',
      'res', 'res-spouse', 'res-children-stirpes',
      'fla', 'fla-exclusion',
    ])
  })
})

describe('mergeSelectionsWithDefaults', () => {
  it('adds missing current defaults while preserving saved exclusions and edits', () => {
    const merged = mergeSelectionsWithDefaults('single_will', [
      {
        clauseId: 'rev-single',
        section: 'Revocation',
        included: false,
        customText: '<p>Firm-approved client edit</p>',
        aiGenerated: false,
        sortOrder: 7,
      },
    ])

    const revocation = merged.find((clause) => clause.clauseId === 'rev-single')
    expect(revocation).toMatchObject({
      included: false,
      customText: '<p>Firm-approved client edit</p>',
      sortOrder: 7,
    })
    expect(merged.map((clause) => clause.clauseId)).toContain('fla-exclusion')
    expect(merged.find((clause) => clause.clauseId === 'fla-exclusion')?.included).toBe(true)
  })

  it('retains saved optional clauses after the default set', () => {
    const optional = {
      clauseId: 'trust-henson',
      section: 'Trusts',
      included: true,
      aiGenerated: false,
      sortOrder: 99,
    }
    const merged = mergeSelectionsWithDefaults('single_will', [optional])

    expect(merged.filter((clause) => clause.clauseId === optional.clauseId)).toHaveLength(1)
    expect(merged.at(-1)?.clauseId).toBe(optional.clauseId)
  })
})

describe('getClauseTree', () => {
  it('returns folders with children arrays for single_will', () => {
    const tree = getClauseTree('single_will')
    expect(tree.length).toBeGreaterThan(0)
    for (const folder of tree) {
      expect(folder.isFolder).toBe(true)
      expect(Array.isArray(folder.children)).toBe(true)
    }
  })

  it('folders have sorted children for probate_will', () => {
    const tree = getClauseTree('probate_will')
    for (const folder of tree) {
      if (folder.children && folder.children.length > 1) {
        for (let i = 1; i < folder.children.length; i++) {
          expect(folder.children[i].sortOrder).toBeGreaterThanOrEqual(
            folder.children[i - 1].sortOrder
          )
        }
      }
    }
  })
})

describe('resolveTemplateText', () => {
  it('resolves all placeholders with provided variables', () => {
    const result = resolveTemplateText('Hello {{name}}, age {{age}}', {
      name: 'John',
      age: '25',
    })
    expect(result).toBe('Hello John, age 25')
  })

  it('replaces unresolved placeholders with bracketed fallback', () => {
    const result = resolveTemplateText('Hello {{name}}', {})
    expect(result).toBe('Hello [name]')
  })
})

describe('getClauseTemplate', () => {
  it('returns the correct clause for a known id', () => {
    const clause = getClauseTemplate('rev-single')
    expect(clause).toBeDefined()
    expect(clause!.id).toBe('rev-single')
    expect(clause!.section).toBe('Revocation')
  })

  it('returns undefined for nonexistent id', () => {
    const clause = getClauseTemplate('nonexistent')
    expect(clause).toBeUndefined()
  })
})

describe('getDocumentTypeConfig', () => {
  it('returns correct config for probate_will', () => {
    const config = getDocumentTypeConfig('probate_will')
    expect(config).toBeDefined()
    expect(config!.id).toBe('probate_will')
    expect(config!.tier).toBe(2)
    expect(config!.shortName).toBe('Probate Will')
  })

  it('all 9 document types have configs', () => {
    const allTypes = [
      'simple_will_short',
      'single_will',
      'probate_will',
      'non_probate_will',
      'poa_property',
      'poa_personal_care',
      'affidavit_execution',
      'affidavit_execution_probate',
      'affidavit_execution_non_probate',
    ] as const
    for (const t of allTypes) {
      expect(getDocumentTypeConfig(t), `Missing config for ${t}`).toBeDefined()
    }
  })
})

describe('determineRequiredDocuments', () => {
  it('Tier 1 without dual will returns short-form will + affidavit + POAs by default', () => {
    const docs = determineRequiredDocuments({
      tier: 1,
      hasDualWill: false,
      hasPoaProperty: true,
      hasPoaPersonalCare: true,
    })
    expect(docs).toEqual([
      'simple_will_short',
      'affidavit_execution',
      'poa_property',
      'poa_personal_care',
    ])
  })

  it('Tier 1 can request the standard single will instead of the short form', () => {
    const docs = determineRequiredDocuments({
      tier: 1,
      hasDualWill: false,
      hasPoaProperty: false,
      hasPoaPersonalCare: false,
      willStyle: 'standard',
    })
    expect(docs).toEqual(['single_will', 'affidavit_execution'])
  })

  it('Tier 2 with dual will returns probate + non-probate + two affidavits + POA', () => {
    const docs = determineRequiredDocuments({
      tier: 2,
      hasDualWill: true,
      hasPoaProperty: true,
      hasPoaPersonalCare: false,
    })
    expect(docs).toEqual([
      'probate_will',
      'non_probate_will',
      'affidavit_execution_probate',
      'affidavit_execution_non_probate',
      'poa_property',
    ])
  })
})

describe('willDocumentTypes tiers', () => {
  it('Tier 1 types are short will, single_will, poa_property, poa_personal_care, affidavit_execution', () => {
    const tier1Ids = willDocumentTypes.filter((t) => t.tier === 1).map((t) => t.id)
    expect(tier1Ids).toContain('simple_will_short')
    expect(tier1Ids).toContain('single_will')
    expect(tier1Ids).toContain('poa_property')
    expect(tier1Ids).toContain('poa_personal_care')
    expect(tier1Ids).toContain('affidavit_execution')
    expect(tier1Ids.length).toBe(5)
  })

  it('Tier 2 types are probate_will, non_probate_will, affidavit_execution_probate, affidavit_execution_non_probate', () => {
    const tier2Ids = willDocumentTypes.filter((t) => t.tier === 2).map((t) => t.id)
    expect(tier2Ids).toContain('probate_will')
    expect(tier2Ids).toContain('non_probate_will')
    expect(tier2Ids).toContain('affidavit_execution_probate')
    expect(tier2Ids).toContain('affidavit_execution_non_probate')
    expect(tier2Ids.length).toBe(4)
  })
})
