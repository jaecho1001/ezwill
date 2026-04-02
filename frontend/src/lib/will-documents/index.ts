import type { WillClauseTemplate, WillDocumentType, WillDocumentTypeConfig, SelectedWillClause } from "@/types/will-document"
import { willClauseLibrary } from "./clause-library"

// ── Document Type Configurations ─────────────────────────────────────

export const willDocumentTypes: WillDocumentTypeConfig[] = [
  {
    id: "single_will",
    name: "Last Will and Testament",
    shortName: "Simple Will",
    description: "Single will covering all assets, suitable for straightforward estates.",
    icon: "📜",
    tier: 1,
    defaultClauseIds: [
      "rev", "rev-single",
      "interp", "interp-spouse", "interp-children", "interp-issue",
      "appt", "appt-primary", "appt-backup", "appt-compensation",
      "debt", "debt-payment",
      "gifts", "gifts-item", "gifts-cash", "gifts-charity",
      "res", "res-spouse", "res-children-stirpes", "res-common-disaster", "res-survival-period",
      "fla", "fla-exclusion",
      "trust", "trust-minor",
      "guard", "guard-primary",
      "powers", "powers-investment", "powers-distribution-in-kind", "powers-minor-payment",
      "test", "test-in-person",
    ],
  },
  {
    id: "probate_will",
    name: "Last Will and Testament — Primary (Probate Will)",
    shortName: "Probate Will",
    description: "Primary will for probate assets in a dual-will strategy. Requires a companion Non-Probate Will.",
    icon: "📋",
    tier: 2,
    defaultClauseIds: [
      "rev", "rev-probate",
      "interp", "interp-spouse", "interp-children", "interp-issue", "interp-probate-assets",
      "interp-trustee-reference", "interp-relationship", "interp-gender-number",
      "appt", "appt-primary", "appt-backup", "appt-corporate", "appt-compensation",
      "appt-trustee-decision",
      "debt", "debt-payment", "debt-dual-allocation", "debt-abatement",
      "gifts", "gifts-item", "gifts-cash", "gifts-charity",
      "res", "res-spouse", "res-children-stirpes", "res-common-disaster", "res-survival-period",
      "fla", "fla-exclusion",
      "trust", "trust-minor", "trust-henson", "trust-spousal",
      "gre", "gre-maintenance",
      "guard", "guard-primary",
      "powers", "powers-investment", "powers-distribution-in-kind", "powers-borrowing",
      "powers-combine-trusts", "powers-resp", "powers-minor-payment",
      "powers-realization", "powers-real-property", "powers-lending",
      "powers-elections", "powers-exoneration", "powers-gradual-liquidation",
      "test", "test-in-person",
    ],
  },
  {
    id: "non_probate_will",
    name: "Last Will and Testament — Secondary (Non-Probate Will)",
    shortName: "Non-Probate Will",
    description: "Secondary/private will for non-probate assets (private company shares, LP interests). Avoids EAT probate fees.",
    icon: "🔒",
    tier: 2,
    defaultClauseIds: [
      "rev", "rev-nonprobate",
      "interp", "interp-spouse", "interp-children", "interp-issue", "interp-nonprobate-assets",
      "interp-nonprobate-defined", "interp-corporation-changes",
      "interp-trustee-reference", "interp-relationship", "interp-gender-number",
      "appt", "appt-primary", "appt-backup", "appt-compensation",
      "appt-trustee-decision", "appt-no-certificate",
      "debt", "debt-dual-allocation-np", "debt-abatement",
      "res", "res-spouse", "res-children-stirpes", "res-common-disaster", "res-survival-period",
      "fla", "fla-exclusion",
      "trust", "trust-minor",
      "powers", "powers-investment", "powers-distribution-in-kind",
      "powers-realization", "powers-real-property", "powers-lending",
      "powers-elections", "powers-exoneration", "powers-gradual-liquidation",
      "test", "test-in-person",
    ],
  },
  {
    id: "poa_property",
    name: "Continuing Power of Attorney for Property",
    shortName: "POA — Property",
    description: "Appoints attorney(s) to manage financial and property decisions under the SDA.",
    icon: "🏠",
    tier: 1,
    defaultClauseIds: [
      "poa-prop", "poa-prop-appt", "poa-prop-effective", "poa-prop-compensation", "poa-prop-restrictions",
    ],
  },
  {
    id: "poa_personal_care",
    name: "Power of Attorney for Personal Care",
    shortName: "POA — Personal Care",
    description: "Appoints attorney(s) for health and personal care decisions under the SDA/HCCA.",
    icon: "❤️",
    tier: 1,
    defaultClauseIds: [
      "poa-care", "poa-care-appt", "poa-care-wishes", "poa-care-organ",
    ],
  },
  {
    id: "affidavit_execution",
    name: "Affidavit of Execution",
    shortName: "Affidavit",
    description: "Sworn statement by a witness confirming proper execution of the Will under SLRA s.4.",
    icon: "✍️",
    tier: 1,
    defaultClauseIds: [
      "aff", "aff-standard",
    ],
  },
  {
    id: "affidavit_execution_probate",
    name: "Affidavit of Execution — Probate Will",
    shortName: "Affidavit (Probate)",
    description: "Affidavit of Execution specific to the Probate Will in a dual-will strategy.",
    icon: "✍️",
    tier: 2,
    defaultClauseIds: [
      "aff", "aff-probate-will",
    ],
  },
  {
    id: "affidavit_execution_non_probate",
    name: "Affidavit of Execution — Non-Probate Will",
    shortName: "Affidavit (Non-Probate)",
    description: "Affidavit of Execution specific to the Non-Probate Will in a dual-will strategy.",
    icon: "✍️",
    tier: 2,
    defaultClauseIds: [
      "aff", "aff-nonprobate-will",
    ],
  },
]

// ── Helper Functions ─────────────────────────────────────────────────

/** Get clauses applicable to a specific document type */
export function getClausesForDocumentType(docType: WillDocumentType): WillClauseTemplate[] {
  return willClauseLibrary.filter(
    (c) => c.documentType === docType || c.documentType === "all"
  )
}

/** Get a document type config by ID */
export function getDocumentTypeConfig(docType: WillDocumentType): WillDocumentTypeConfig | undefined {
  return willDocumentTypes.find((t) => t.id === docType)
}

/** Get document title for rendering */
export function getDocumentTitle(docType: WillDocumentType): string {
  const titles: Record<WillDocumentType, string> = {
    single_will: "LAST WILL AND TESTAMENT",
    probate_will: "LAST WILL AND TESTAMENT (PROBATE WILL)",
    non_probate_will: "LAST WILL AND TESTAMENT (NON-PROBATE WILL)",
    poa_property: "CONTINUING POWER OF ATTORNEY FOR PROPERTY",
    poa_personal_care: "POWER OF ATTORNEY FOR PERSONAL CARE",
    affidavit_execution: "AFFIDAVIT OF EXECUTION",
    affidavit_execution_probate: "AFFIDAVIT OF EXECUTION (PROBATE WILL)",
    affidavit_execution_non_probate: "AFFIDAVIT OF EXECUTION (NON-PROBATE WILL)",
  }
  return titles[docType]
}

/** Build default SelectedWillClause[] for a document type */
export function buildDefaultSelections(docType: WillDocumentType): SelectedWillClause[] {
  const config = getDocumentTypeConfig(docType)
  if (!config) return []

  return config.defaultClauseIds.map((clauseId, index) => {
    const template = willClauseLibrary.find((c) => c.id === clauseId)
    return {
      clauseId,
      section: template?.section ?? "",
      subsection: template?.subsection,
      included: true,
      aiGenerated: false,
      sortOrder: index,
    }
  })
}

/** Find a clause template by ID */
export function getClauseTemplate(clauseId: string): WillClauseTemplate | undefined {
  return willClauseLibrary.find((c) => c.id === clauseId)
}

/** Get all clause templates organized by section (tree structure) */
export function getClauseTree(docType: WillDocumentType): WillClauseTemplate[] {
  const applicable = getClausesForDocumentType(docType)
  const folders = applicable.filter((c) => c.isFolder)

  return folders.map((folder) => ({
    ...folder,
    children: applicable
      .filter((c) => c.parentId === folder.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }))
}

/** Resolve {{placeholder}} variables in template text */
export function resolveTemplateText(
  templateText: string,
  variables: Record<string, string>
): string {
  return templateText.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `[${key}]`)
}

/** Get Tier 1 document types (included in basic package) */
export function getTier1DocumentTypes(): WillDocumentTypeConfig[] {
  return willDocumentTypes.filter((t) => t.tier === 1)
}

/** Get Tier 2 document types (advanced / dual will package) */
export function getTier2DocumentTypes(): WillDocumentTypeConfig[] {
  return willDocumentTypes.filter((t) => t.tier === 2)
}

/** Determine which documents a client needs based on their will data */
export function determineRequiredDocuments(willData: {
  tier: 1 | 2
  hasDualWill: boolean
  hasPoaProperty: boolean
  hasPoaPersonalCare: boolean
}): WillDocumentType[] {
  const docs: WillDocumentType[] = []

  if (willData.tier === 2 && willData.hasDualWill) {
    docs.push("probate_will", "non_probate_will")
    docs.push("affidavit_execution_probate", "affidavit_execution_non_probate")
  } else {
    docs.push("single_will")
    docs.push("affidavit_execution")
  }

  if (willData.hasPoaProperty) docs.push("poa_property")
  if (willData.hasPoaPersonalCare) docs.push("poa_personal_care")

  return docs
}

// ── Re-exports ───────────────────────────────────────────────────────

export { willClauseLibrary }
