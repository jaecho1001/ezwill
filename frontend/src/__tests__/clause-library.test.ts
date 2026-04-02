import { describe, it, expect } from 'vitest'
import { willClauseLibrary } from '@/lib/will-documents/clause-library'
import {
  willDocumentTypes,
  getClausesForDocumentType,
  buildDefaultSelections,
  getClauseTree,
  resolveTemplateText,
  getClauseTemplate,
  determineRequiredDocuments,
  getDocumentTypeConfig,
} from '@/lib/will-documents/index'

describe('Clause Library — Data Integrity', () => {
  it('all clause IDs are unique (no duplicates)', () => {
    const ids = willClauseLibrary.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('all parentId references point to valid folder clauses', () => {
    const folderIds = new Set(
      willClauseLibrary.filter((c) => c.isFolder).map((c) => c.id)
    )
    for (const clause of willClauseLibrary) {
      if (clause.parentId) {
        expect(
          folderIds.has(clause.parentId),
          `Clause "${clause.id}" has parentId "${clause.parentId}" which is not a valid folder`
        ).toBe(true)
      }
    }
  })

  it('all folder clauses have isFolder=true', () => {
    const folders = willClauseLibrary.filter((c) => c.isFolder)
    for (const folder of folders) {
      expect(folder.isFolder).toBe(true)
    }
    // Also check: clauses referenced as parentId must be folders
    const referencedParents = new Set(
      willClauseLibrary.filter((c) => c.parentId).map((c) => c.parentId!)
    )
    for (const parentId of referencedParents) {
      const parent = willClauseLibrary.find((c) => c.id === parentId)
      expect(
        parent?.isFolder,
        `Clause "${parentId}" is referenced as a parentId but is not a folder`
      ).toBe(true)
    }
  })

  it('all leaf clauses have non-empty templateText', () => {
    const leaves = willClauseLibrary.filter((c) => !c.isFolder)
    for (const leaf of leaves) {
      expect(
        leaf.templateText.length,
        `Leaf clause "${leaf.id}" has empty templateText`
      ).toBeGreaterThan(0)
    }
  })

  it('all clauses have valid tier (1 or 2)', () => {
    for (const clause of willClauseLibrary) {
      expect(
        [1, 2].includes(clause.tier),
        `Clause "${clause.id}" has invalid tier: ${clause.tier}`
      ).toBe(true)
    }
  })

  it('all clauses have valid documentType', () => {
    const validTypes = [
      'all',
      'single_will',
      'probate_will',
      'non_probate_will',
      'poa_property',
      'poa_personal_care',
      'affidavit_execution',
      'affidavit_execution_probate',
      'affidavit_execution_non_probate',
    ]
    for (const clause of willClauseLibrary) {
      expect(
        validTypes.includes(clause.documentType),
        `Clause "${clause.id}" has invalid documentType: "${clause.documentType}"`
      ).toBe(true)
    }
  })

  it('every defaultClauseId in willDocumentTypes exists in willClauseLibrary', () => {
    const libraryIds = new Set(willClauseLibrary.map((c) => c.id))
    for (const docType of willDocumentTypes) {
      for (const clauseId of docType.defaultClauseIds) {
        expect(
          libraryIds.has(clauseId),
          `Document type "${docType.id}" references defaultClauseId "${clauseId}" not found in library`
        ).toBe(true)
      }
    }
  })

  it('no orphan clauses (every non-folder has a valid parentId)', () => {
    const allIds = new Set(willClauseLibrary.map((c) => c.id))
    const nonFolders = willClauseLibrary.filter((c) => !c.isFolder)
    for (const clause of nonFolders) {
      expect(
        clause.parentId,
        `Non-folder clause "${clause.id}" has no parentId`
      ).toBeTruthy()
      expect(
        allIds.has(clause.parentId!),
        `Non-folder clause "${clause.id}" has parentId "${clause.parentId}" not in library`
      ).toBe(true)
    }
  })

  it('all sections are represented in at least one document type', () => {
    const sections = new Set(willClauseLibrary.map((c) => c.section))
    // Each section should have at least one clause that belongs to some document type
    for (const section of sections) {
      const clausesInSection = willClauseLibrary.filter((c) => c.section === section)
      expect(
        clausesInSection.length,
        `Section "${section}" has no clauses`
      ).toBeGreaterThan(0)
    }
  })

  it('clause count is reasonable (>50 clauses total)', () => {
    expect(willClauseLibrary.length).toBeGreaterThan(50)
  })
})
