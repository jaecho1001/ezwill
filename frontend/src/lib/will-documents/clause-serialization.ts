import type { SelectedWillClause } from '@/types/will-document'
import { willClauseLibrary } from './clause-library'

/**
 * Wire shape exchanged with the backend clause API (snake_case), matching the
 * ew_clause_selections columns and the ClauseSelection pydantic model.
 */
export interface StoredClause {
  clause_id: string
  included: boolean
  custom_text: string | null
  template_text: string
  title: string
  is_folder: boolean
  ai_generated: boolean
  sort_order: number
}

function findTemplate(clauseId: string) {
  return willClauseLibrary.find((c) => c.id === clauseId)
}

/**
 * Convert in-memory selections to the backend wire shape, enriching each one
 * with its library body text + structure.
 *
 * Why: the backend generator renders each clause from template_text/custom_text.
 * The frontend used to POST only the selection metadata (no text), so any clause
 * the lawyer didn't hand-edit reached the generator with an empty body — the P0
 * "documents generate empty" bug. Sending template_text/title/is_folder lets the
 * server render a complete will.
 */
export function serializeSelectionsForSave(
  selections: SelectedWillClause[]
): StoredClause[] {
  return selections.map((sc) => {
    const template = findTemplate(sc.clauseId)
    return {
      clause_id: sc.clauseId,
      included: sc.included,
      custom_text: sc.customText ?? null,
      template_text: template?.templateText ?? '',
      title: template?.name ?? '',
      is_folder: template?.isFolder ?? false,
      ai_generated: sc.aiGenerated,
      sort_order: sc.sortOrder,
    }
  })
}

/**
 * Convert stored backend rows (snake_case) back to in-memory SelectedWillClause
 * (camelCase). section/subsection aren't persisted, so re-derive them from the
 * library.
 *
 * Why: the editor keys everything off sc.clauseId. Reading raw snake_case rows
 * left clauseId undefined, so saved selections silently failed to reload (the
 * "clause edits appear lost" bug). This is the inverse of serialize.
 */
export function deserializeStoredClauses(rows: unknown): SelectedWillClause[] {
  if (!Array.isArray(rows)) return []
  return rows.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>
    const clauseId = String(row.clause_id ?? row.clauseId ?? '')
    const template = findTemplate(clauseId)
    const customText = row.custom_text ?? row.customText
    return {
      clauseId,
      section: template?.section ?? '',
      subsection: template?.subsection,
      included: row.included === undefined ? true : Boolean(row.included),
      customText: customText == null ? undefined : String(customText),
      aiGenerated: Boolean(row.ai_generated ?? row.aiGenerated ?? false),
      sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    }
  })
}
