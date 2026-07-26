// API client for EZWill backend at :8003 (proxied via /api/*)

import { getAuthHeaders } from '@/lib/auth'
import type { WillVault } from '@/types/will-vault'

export interface DraftSyncPayload {
  aboutYou?: Record<string, unknown>
  yourFamily?: Record<string, unknown>
  yourEstate?: Record<string, unknown>
  yourArrangements?: Record<string, unknown>
  poaProperty?: Record<string, unknown>
  poaPersonalCare?: Record<string, unknown>
  assets?: unknown[]
  liabilities?: unknown[]
  people?: unknown[]
  aiFlags?: unknown[]
  currentStep?: number
  completedSteps?: number[]
  language?: string
}

export interface ResolvedLink {
  draft_id: string
  client_name: string
  language: 'en' | 'ko'
  status: string
  current_step: number
  completed_steps: number[]
  vault?: Record<string, unknown> | null
  client_email?: string | null
  client_phone?: string | null
}

export interface CreateLinkResponse {
  token: string
  draft_id: string
  link_url: string
  expires_at: string
  client_name: string
}

export interface DraftListItem {
  id: string
  client_first_name: string
  client_last_name: string
  client_email: string | null
  client_phone: string | null
  status: string
  language: string
  current_step: number
  completed_steps: number[]
  submitted_at: string | null
  updated_at: string
  created_at: string
  tier2_clauses: Record<string, unknown> | null
}

export interface QuickDraftResult {
  needs_dual_will: boolean
  reasoning: string
  document_types: string[]
  saved_document_types?: string[]
  saved?: boolean
  engine?: string
}

// AI Draft: analyze the client's answers and auto-select the documents (single
// vs Ontario dual will + POAs), enabling them + any clause selections so the
// Will Editor opens tailored. Uses the LLM when configured, else a deterministic
// rules engine (so it works without an API key).
export async function invokeQuickDraft(
  draftId: string,
  clientData: Record<string, unknown>,
): Promise<QuickDraftResult | null> {
  try {
    const res = await fetch('/api/agents/will/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        capability: 'quick_draft',
        payload: { client_data: clientData, draft_id: draftId },
        correlation_id: `quick-draft-${draftId}`,
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    return (json.result ?? null) as QuickDraftResult | null
  } catch {
    return null
  }
}

// Public self-serve: a client starts their own will online. Returns a draft_id
// + client token (magic-token bound to the draft) so autosave/submit work.
export async function createSelfServeDraft(
  language?: string,
  province?: string,
): Promise<{ draft_id: string; token: string; language: string; province: string } | null> {
  try {
    const res = await fetch('/api/drafts/self-serve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: language ?? 'en', province: province ?? 'ON' }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Resolve a magic link token → get draft_id and prefill data
export async function resolveLink(token: string): Promise<ResolvedLink | null> {
  try {
    const res = await fetch(`/api/links/${token}/resolve`, { method: 'GET' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Save draft progress to server (debounced by caller)
export async function saveDraftToServer(
  draftId: string,
  payload: DraftSyncPayload,
  magicToken?: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getAuthHeaders() }
    if (magicToken) {
      headers['X-Magic-Token'] = magicToken
    }
    const res = await fetch(`/api/drafts/${draftId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        about_you: payload.aboutYou,
        your_family: payload.yourFamily,
        your_estate: payload.yourEstate,
        your_arrangements: payload.yourArrangements,
        poa_property: payload.poaProperty,
        poa_personal_care: payload.poaPersonalCare,
        assets: payload.assets,
        liabilities: payload.liabilities,
        people: payload.people,
        ai_flags: payload.aiFlags,
        current_step: payload.currentStep,
        completed_steps: payload.completedSteps,
        language: payload.language,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Sync the AI-intake vault (and optional contact info) to the server draft.
// The summary flow's data lives in the local WillVault, not the WillDocument
// the questionnaire syncs — without this PUT the lawyer never sees it.
export async function saveVaultToServer(
  draftId: string,
  vault: Record<string, unknown>,
  contact?: { email?: string; phone?: string },
  magicToken?: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getAuthHeaders() }
    if (magicToken) {
      headers['X-Magic-Token'] = magicToken
    }
    const projection = projectVaultForServer(vault as unknown as WillVault)
    const body: Record<string, unknown> = { vault, ...projection }
    if (contact?.email) body.client_email = contact.email
    if (contact?.phone) body.client_phone = contact.phone
    const res = await fetch(`/api/drafts/${draftId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export function projectVaultForServer(vault: WillVault): {
  people: Record<string, unknown>[]
  assets: Record<string, unknown>[]
  liabilities: Record<string, unknown>[]
} {
  const people: Record<string, unknown>[] = []
  const addPerson = (
    person: { fullName?: string; relationship?: string; dob?: string; receivesODSP?: boolean; sharePercent?: number },
    role: string,
  ) => {
    if (!person.fullName?.trim()) return
    const parts = person.fullName.trim().split(/\s+/)
    people.push({
      role,
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
      relationship: person.relationship,
      birthDate: person.dob,
      receivesODSP: person.receivesODSP,
      percentage: person.sharePercent,
    })
  }
  if (vault.spouse?.included) addPerson(vault.spouse, 'spouse')
  vault.children.forEach((person) => addPerson(person, 'child'))
  vault.executors.forEach((person) => addPerson(person, person.isBackup ? 'backup_executor' : 'executor'))
  vault.guardians.forEach((person) => addPerson(person, 'guardian'))
  vault.beneficiaries.forEach((person) => addPerson(person, 'beneficiary'))
  vault.contingentBeneficiaries.forEach((person) => addPerson(person, 'contingent_beneficiary'))
  vault.poa.property.attorneys.forEach((person) =>
    addPerson(person, person.isBackup ? 'backup_attorney' : 'attorney_property'))
  vault.poa.personalCare.attorneys.forEach((person) =>
    addPerson(person, person.isBackup ? 'backup_attorney' : 'attorney_care'))

  const validAssetType: Record<string, string> = {
    real_estate: 'real_estate',
    bank: 'bank',
    investment: 'investment',
    registered_plan: 'rrsp',
    insurance: 'insurance',
    business: 'business',
    digital: 'digital',
    foreign: 'personal_property',
    other: 'personal_property',
  }
  const assets = (vault.assets.items ?? [])
    .filter((asset) => asset.description.trim())
    .map((asset) => ({
      assetType: validAssetType[asset.type] ?? 'personal_property',
      description: asset.description,
      estimatedValue: asset.estimatedValue,
      beneficiaryDesignation: asset.hasDesignatedBeneficiary,
      designatedBeneficiaryName: asset.designatedBeneficiaryName,
      ownershipType: asset.ownership,
      outsideCanada: asset.outsideCanada,
    }))
  const liabilities = (vault.assets.liabilities ?? [])
    .filter((liability) => liability.description.trim())
    .map((liability) => ({
      liability_type: liability.type,
      description: liability.description,
      outstanding_balance: liability.estimatedBalance,
      ownership_type: liability.jointlyOwed ? 'joint_other' : 'sole',
    }))
  return { people, assets, liabilities }
}

// Submit final draft
export async function submitDraft(draftId: string, magicToken?: string): Promise<{ submitted_at: string } | null> {
  try {
    const headers: Record<string, string> = { ...getAuthHeaders() }
    if (magicToken) {
      headers['X-Magic-Token'] = magicToken
    }
    const res = await fetch(`/api/drafts/${draftId}/submit`, {
      method: 'POST',
      headers,
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Get all drafts (for lawyer dashboard)
export async function listDrafts(params?: {
  status?: string
  limit?: number
  offset?: number
}): Promise<{ drafts: DraftListItem[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const res = await fetch(`/api/drafts?${qs}`, {
    headers: { ...getAuthHeaders() },
  })
  if (!res.ok) throw new Error('Failed to fetch drafts')
  return res.json()
}

// Get single draft (for lawyer dashboard detail)
export async function getDraft(draftId: string): Promise<DraftListItem & { people: unknown[]; ai_flags: unknown[] } | null> {
  try {
    const res = await fetch(`/api/drafts/${draftId}`, {
      headers: { ...getAuthHeaders() },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Create magic link for new client (lawyer action)
// Delivers the questionnaire link via GHL email + SMS
export async function createMagicLink(params: {
  client_first_name: string
  client_last_name: string
  client_email?: string
  client_phone?: string
  language?: string
  note_for_client?: string
  send_email?: boolean
  send_sms?: boolean
}): Promise<CreateLinkResponse | null> {
  try {
    const res = await fetch('/api/links/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        ...params,
        firm_id: 'firm_demo',
        send_email: params.send_email ?? true,
        send_sms: params.send_sms ?? true,
      }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Create a review portal magic link for a client
// Delivers via GHL email + SMS (use options to disable channels)
export async function createReviewLink(
  draftId: string,
  options: { send_email?: boolean; send_sms?: boolean } = {}
): Promise<{
  token: string
  link_url: string
  email_sent?: boolean
  sms_sent?: boolean
} | null> {
  try {
    const qs = new URLSearchParams()
    if (options.send_email !== undefined) qs.set('send_email', String(options.send_email))
    if (options.send_sms !== undefined) qs.set('send_sms', String(options.send_sms))
    const url = `/api/review/link/${draftId}${qs.toString() ? '?' + qs.toString() : ''}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
