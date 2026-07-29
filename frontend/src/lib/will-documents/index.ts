import type { WillClauseTemplate, WillDocumentType, WillDocumentTypeConfig, SelectedWillClause } from "@/types/will-document"
import { willClauseLibrary } from "./clause-library"

// ── Document Type Configurations ─────────────────────────────────────

export const willDocumentTypes: WillDocumentTypeConfig[] = [
  {
    id: "simple_will_short",
    name: "Short Form Last Will and Testament",
    shortName: "Short Will",
    description: "Compact 2-page-ish will for straightforward estates, with only core Ontario clauses selected by default.",
    icon: "📝",
    tier: 1,
    defaultClauseIds: [
      "rev", "rev-single",
      "appt", "appt-primary", "appt-backup",
      "debt", "debt-payment",
      "res", "res-spouse", "res-children-stirpes",
      "fla", "fla-exclusion",
    ],
  },
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
      "poa-care", "poa-care-appt",
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
  const libraryDocType = docType === "simple_will_short" ? "single_will" : docType
  return willClauseLibrary.filter(
    (c) => c.documentType === docType || c.documentType === libraryDocType || c.documentType === "all"
  )
}

/** Get a document type config by ID */
export function getDocumentTypeConfig(docType: WillDocumentType): WillDocumentTypeConfig | undefined {
  return willDocumentTypes.find((t) => t.id === docType)
}

/** Get document title for rendering */
export function getDocumentTitle(docType: WillDocumentType): string {
  const titles: Record<WillDocumentType, string> = {
    simple_will_short: "SHORT FORM LAST WILL AND TESTAMENT",
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

const SENSITIVE_PERSONAL_CARE_CLAUSES = new Set([
  'poa-care-wishes',
  'poa-care-organ',
])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
}

/** Clause IDs supported by an affirmative canonical or legacy client answer. */
export function affirmedPersonalCareClauseIds(
  draft: Record<string, unknown>
): ReadonlySet<string> {
  const vault = asRecord(draft.vault)
  const poa = asRecord(vault.poa)
  const vaultCare = asRecord(poa.personalCare)
  const legacyCare = asRecord(
    draft.poa_personal_care ?? draft.poaPersonalCare
  )
  const lifeSupport = Object.hasOwn(vaultCare, 'lifeSupport')
    ? vaultCare.lifeSupport
    : legacyCare.lifeSupport
  const organDonation = Object.hasOwn(vaultCare, 'organDonation')
    ? vaultCare.organDonation
    : legacyCare.organDonation
  const affirmed = new Set<string>()
  if (lifeSupport === 'withhold') affirmed.add('poa-care-wishes')
  if (organDonation === true) affirmed.add('poa-care-organ')
  return affirmed
}

/**
 * Clauses that are only fillable when the client actually supplied the
 * matching data (#84). Included-by-default with no data, each one guaranteed
 * an unresolved-placeholder 422 on every generation: a specific-gift clause
 * with no gift, a Henson trust with no ODSP facts, an RESP power with no
 * RESP. Default-on was the reason "a complete intake could not deliver
 * 7 of 9 document types".
 *
 * poa-prop-restrictions is here because its {{restrictionConsentPerson}}
 * has NO intake data source at all — the intake captures the client's
 * restriction wishes as free text, which a lawyer must turn into clause
 * terms. Default-on meant every default POA-property generation 422'd.
 * It is never auto-supported; a lawyer's explicit stored row still wins.
 */
export const DATA_CONDITIONAL_CLAUSES: ReadonlySet<string> = new Set([
  'gifts-item', 'gifts-cash', 'gifts-charity',
  'trust-henson', 'trust-spousal', 'powers-resp',
  'poa-prop-restrictions',
])

/** Which data-conditional clauses this draft's answers can actually fill. */
export function supportedConditionalClauseIds(
  draft: Record<string, unknown>
): ReadonlySet<string> {
  const vault = asRecord(draft.vault)
  const gifts = Array.isArray(vault.gifts) ? (vault.gifts as unknown[]).map(asRecord) : []
  const estate = asRecord(draft.your_estate ?? draft.yourEstate)
  const legacyGifts = Array.isArray(estate.gifts) ? (estate.gifts as unknown[]).map(asRecord) : []
  const legacyDonations = Array.isArray(estate.donations) ? (estate.donations as unknown[]).map(asRecord) : []
  const goals = asRecord(vault.goals)
  const children = Array.isArray(vault.children) ? (vault.children as unknown[]).map(asRecord) : []
  const assets = asRecord(vault.assets)
  const assetItems = Array.isArray(assets.items) ? (assets.items as unknown[]).map(asRecord) : []
  const legacyAssets = Array.isArray(draft.assets) ? (draft.assets as unknown[]).map(asRecord) : []

  const supported = new Set<string>()
  const nonMoneyGift = (g: Record<string, unknown>) =>
    g.type !== 'charity' && g.type !== 'cash' && Boolean(g.description)
  if (
    gifts.some((g) => nonMoneyGift(g) && Boolean(g.recipientName))
    || legacyGifts.some(nonMoneyGift)
  ) supported.add('gifts-item')
  if (
    gifts.some((g) => g.type === 'cash' && g.amount != null && Boolean(g.recipientName))
    || legacyGifts.some((g) => g.type === 'cash' && g.amount != null)
  ) supported.add('gifts-cash')
  if (
    gifts.some((g) => Boolean(g.charityName))
    || legacyDonations.some((g) => Boolean(g.charityName))
    || legacyGifts.some((g) => Boolean(g.charityName))
  ) supported.add('gifts-charity')
  if (goals.henson === true || children.some((c) => c.receivesODSP === true)) {
    supported.add('trust-henson')
  }
  if (goals.spousalTrust === true) supported.add('trust-spousal')
  if (
    assetItems.some((i) => i.type === 'registered_plan')
    || legacyAssets.some((a) =>
      (a.asset_type ?? a.assetType) === 'resp' || a.isRESP === true)
  ) supported.add('powers-resp')
  return supported
}

/**
 * Merge persisted selections with the current default set.
 *
 * Persisted rows always win, including an explicit `included: false`. Defaults
 * that were introduced after a draft was last saved are appended so the Will
 * Editor never opens with an incomplete legacy default set. Personal-care
 * clauses that used to be defaults are forced off unless the client supplied
 * the matching affirmative instruction. Data-conditional clauses default OFF
 * unless the draft's answers can fill them — a stored row (the lawyer's
 * explicit choice) always overrides that.
 */
export function mergeSelectionsWithDefaults(
  docType: WillDocumentType,
  stored: SelectedWillClause[],
  affirmedSensitiveClauseIds: ReadonlySet<string> = new Set(),
  supportedConditionalIds: ReadonlySet<string> | null = null,
): SelectedWillClause[] {
  const defaults = buildDefaultSelections(docType).map((defaultClause) => (
    supportedConditionalIds !== null
    && DATA_CONDITIONAL_CLAUSES.has(defaultClause.clauseId)
    && !supportedConditionalIds.has(defaultClause.clauseId)
      ? { ...defaultClause, included: false }
      : defaultClause
  ))
  const safeStored = stored.map((clause) => (
    docType === 'poa_personal_care'
    && SENSITIVE_PERSONAL_CARE_CLAUSES.has(clause.clauseId)
    && !affirmedSensitiveClauseIds.has(clause.clauseId)
      ? { ...clause, included: false }
      : clause
  ))
  const storedById = new Map(safeStored.map((clause) => [clause.clauseId, clause]))
  const merged = defaults.map((defaultClause) => storedById.get(defaultClause.clauseId) ?? defaultClause)
  const defaultIds = new Set(defaults.map((clause) => clause.clauseId))

  for (const clause of safeStored) {
    if (!defaultIds.has(clause.clauseId)) merged.push(clause)
  }

  return merged.map((clause, index) => ({ ...clause, sortOrder: clause.sortOrder ?? index }))
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


/**
 * Requirement GROUPS derived from the DRAFT RECORD (legacy columns + vault).
 * MIRROR of backend required_document_groups (services/db.py) — the overview
 * queue and the lawyer-facing screens must agree on what "required" means,
 * or a file can leave the lawyer's queue while a screen still shows pending
 * documents. Each group is satisfied by ANY member: the non-dual will group
 * lists BOTH will styles because the backend deliberately accepts either
 * (short or standard) as the will. The first member of each group is the
 * default display type. POAs are required only when the client actually
 * REQUESTED one, never by default.
 */
export function requiredDocGroupsForDraft(
  draft: Record<string, unknown>
): WillDocumentType[][] {
  const vault = asRecord(draft.vault)
  const goals = asRecord(vault.goals)
  const vaultPoa = asRecord(vault.poa)
  const estate = asRecord(draft.your_estate ?? draft.yourEstate)
  const legacyProp = asRecord(draft.poa_property ?? draft.poaProperty)
  const legacyCare = asRecord(draft.poa_personal_care ?? draft.poaPersonalCare)

  const hasDualWill = Boolean(estate.includeDualWill || goals.hasDualWill)
  const hasPoaProperty = Boolean(
    legacyProp.hasAttorney
    || asRecord(vaultPoa.property).requested
    || goals.hasPoaProperty
  )
  const hasPoaPersonalCare = Boolean(
    legacyCare.hasAttorney
    || asRecord(vaultPoa.personalCare).requested
    || goals.hasPoaPersonalCare
  )

  const groups: WillDocumentType[][] = hasDualWill
    ? [
        ['probate_will'],
        ['non_probate_will'],
        ['affidavit_execution_probate'],
        ['affidavit_execution_non_probate'],
      ]
    : [['simple_will_short', 'single_will'], ['affidavit_execution']]
  if (hasPoaProperty) groups.push(['poa_property'])
  if (hasPoaPersonalCare) groups.push(['poa_personal_care'])
  return groups
}

/** Default display type per requirement group (first member of each). */
export function requiredDocTypesForDraft(
  draft: Record<string, unknown>
): WillDocumentType[] {
  return requiredDocGroupsForDraft(draft).map((group) => group[0])
}

/**
 * Which member of a requirement group to display, given the server's
 * per-type generation/approval state. An approved member wins (it is the
 * document that satisfies the queue), then a generated one, then the group
 * default — so a STANDARD will approved in place of the short will doesn't
 * leave the Documents screen claiming the short will is still pending.
 */
export function resolveDocTypeForGroup(
  group: WillDocumentType[],
  serverState: ReadonlyMap<
    string,
    { generated_at?: string | null; lawyer_approved_at?: string | null }
  >
): WillDocumentType {
  return (
    group.find((t) => serverState.get(t)?.lawyer_approved_at)
    ?? group.find((t) => serverState.get(t)?.generated_at)
    ?? group[0]
  )
}

/** Determine which documents a client needs based on their will data */
export function determineRequiredDocuments(willData: {
  tier: 1 | 2
  hasDualWill: boolean
  hasPoaProperty: boolean
  hasPoaPersonalCare: boolean
  willStyle?: "short" | "standard"
}): WillDocumentType[] {
  const docs: WillDocumentType[] = []

  if (willData.tier === 2 && willData.hasDualWill) {
    docs.push("probate_will", "non_probate_will")
    docs.push("affidavit_execution_probate", "affidavit_execution_non_probate")
  } else {
    docs.push(willData.willStyle === "standard" ? "single_will" : "simple_will_short")
    docs.push("affidavit_execution")
  }

  if (willData.hasPoaProperty) docs.push("poa_property")
  if (willData.hasPoaPersonalCare) docs.push("poa_personal_care")

  return docs
}

// ── Re-exports ───────────────────────────────────────────────────────

export { willClauseLibrary }
