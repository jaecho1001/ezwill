/**
 * EZWill — Document clause system (mirrors DivorceMate agreement.ts pattern)
 *
 * A Will is composed of selectable clauses from the clause library.
 * After initial generation, the lawyer can:
 * 1. Add/remove clauses from the library
 * 2. Edit any clause text (customText)
 * 3. Reorder clauses within sections
 * 4. Use AI to suggest/generate clause text
 */

export interface WillClauseTemplate {
  id: string
  section: string
  subsection?: string
  name: string
  parentId?: string
  sortOrder: number
  isFolder: boolean
  templateText: string           // with {{placeholder}} variables
  annotation?: string            // plain-language explanation for the lawyer
  annotationKo?: string          // Korean annotation
  statute?: string               // e.g. "SLRA s.4", "FLA s.4(2)(2)"
  caselaw?: string               // e.g. "Pecore v. Pecore [2007] 1 SCR 795"
  applicableWhen?: Record<string, unknown>  // condition to auto-include
  tier: 1 | 2                    // which tier includes this clause
  children?: WillClauseTemplate[]
  documentType: WillDocumentType | 'all'  // which document this clause belongs to
}

export interface SelectedWillClause {
  clauseId: string
  section: string
  subsection?: string
  included: boolean
  customText?: string            // lawyer's edited version (overrides template)
  aiGenerated: boolean
  sortOrder: number
}

export type WillDocumentType =
  | 'single_will'            // Tier 1 simple will
  | 'probate_will'           // Dual will — primary/probate
  | 'non_probate_will'       // Dual will — secondary/private
  | 'poa_property'           // Continuing POA for Property
  | 'poa_personal_care'      // POA for Personal Care
  | 'affidavit_execution'    // Affidavit of Execution
  | 'affidavit_execution_probate'    // Affidavit of Execution (probate will)
  | 'affidavit_execution_non_probate' // Affidavit of Execution (non-probate will)

export interface WillDocumentTypeConfig {
  id: WillDocumentType
  name: string
  shortName: string
  description: string
  icon: string
  tier: 1 | 2
  defaultClauseIds: string[]
}

/**
 * Signing page — structured data for precise formatting with tables
 * (preserves spacing similar to original .doc templates)
 */
export interface SigningPageData {
  // Will signing (SLRA s.4)
  testatorName: string
  dateOfSigning?: string
  location?: string
  signingMethod: 'in_person' | 'remote_video'  // SLRA s.4 or s.21.1

  // Witnesses
  witness1: WitnessData
  witness2: WitnessData

  // For remote video (SLRA s.21.1)
  remotePlatform?: string       // Zoom, Teams, etc.
  lsoWitnessIndex?: 1 | 2      // which witness is the LSO licensee
}

export interface WitnessData {
  name: string
  address: string
  occupation?: string
  isLSOLicensee?: boolean       // required for remote video execution
  lsoNumber?: string
}

/**
 * Affidavit of Execution — required for probate
 * One per will (simple, probate, non-probate)
 */
export interface AffidavitOfExecutionData {
  type: 'simple' | 'probate' | 'non_probate'
  deponentName: string          // the witness making the affidavit
  deponentAddress: string
  deponentOccupation?: string
  testatorName: string
  dateOfWill: string
  dateOfAffidavit?: string
  commissionerName?: string
  commissionerExpiry?: string
  // For remote (O.Reg 431/20)
  isRemote: boolean
  remotePlatform?: string
}
