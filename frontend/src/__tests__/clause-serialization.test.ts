import { describe, expect, it } from 'vitest'
import {
  serializeSelectionsForSave,
  deserializeStoredClauses,
} from '@/lib/will-documents/clause-serialization'
import { willClauseLibrary } from '@/lib/will-documents/clause-library'
import type { SelectedWillClause } from '@/types/will-document'

// A real body clause from the library (has non-empty templateText + a name).
const bodyClause = willClauseLibrary.find((c) => !c.isFolder && c.templateText)!

describe('serializeSelectionsForSave', () => {
  it('enriches an unedited selection with the library body text (the P0 fix)', () => {
    const selection: SelectedWillClause = {
      clauseId: bodyClause.id,
      section: bodyClause.section,
      included: true,
      aiGenerated: false,
      sortOrder: 3,
      // no customText — lawyer never edited it
    }

    const [wire] = serializeSelectionsForSave([selection])

    expect(wire.clause_id).toBe(bodyClause.id)
    expect(wire.template_text).toBe(bodyClause.templateText)
    expect(wire.template_text.length).toBeGreaterThan(0) // NOT empty → renders
    expect(wire.title).toBe(bodyClause.name)
    expect(wire.is_folder).toBe(false)
    expect(wire.custom_text).toBeNull()
    expect(wire.sort_order).toBe(3)
  })

  it('preserves the lawyer edit in custom_text', () => {
    const [wire] = serializeSelectionsForSave([
      {
        clauseId: bodyClause.id,
        section: bodyClause.section,
        included: true,
        customText: '<p>lawyer edit</p>',
        aiGenerated: false,
        sortOrder: 0,
      },
    ])
    expect(wire.custom_text).toBe('<p>lawyer edit</p>')
    expect(wire.template_text).toBe(bodyClause.templateText) // both travel
  })
})

describe('deserializeStoredClauses', () => {
  it('maps snake_case rows back to camelCase and restores clauseId (reload fix)', () => {
    const rows = [
      {
        clause_id: bodyClause.id,
        included: true,
        custom_text: null,
        template_text: bodyClause.templateText,
        title: bodyClause.name,
        is_folder: false,
        ai_generated: false,
        sort_order: 5,
      },
    ]

    const [sel] = deserializeStoredClauses(rows)

    expect(sel.clauseId).toBe(bodyClause.id) // was undefined before the fix
    expect(sel.section).toBe(bodyClause.section) // re-derived from library
    expect(sel.included).toBe(true)
    expect(sel.customText).toBeUndefined()
    expect(sel.sortOrder).toBe(5)
  })

  it('round-trips serialize -> deserialize without losing selection identity', () => {
    const original: SelectedWillClause = {
      clauseId: bodyClause.id,
      section: bodyClause.section,
      included: true,
      customText: undefined,
      aiGenerated: false,
      sortOrder: 2,
    }
    const back = deserializeStoredClauses(serializeSelectionsForSave([original]))[0]
    expect(back.clauseId).toBe(original.clauseId)
    expect(back.included).toBe(original.included)
    expect(back.sortOrder).toBe(original.sortOrder)
  })

  it('returns [] for non-array input', () => {
    expect(deserializeStoredClauses(undefined)).toEqual([])
    expect(deserializeStoredClauses(null)).toEqual([])
  })
})
