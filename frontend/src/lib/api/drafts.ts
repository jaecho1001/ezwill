// API client for EZWill backend at :8003 (proxied via /api/*)

export interface DraftSyncPayload {
  aboutYou?: Record<string, unknown>
  yourFamily?: Record<string, unknown>
  yourEstate?: Record<string, unknown>
  yourArrangements?: Record<string, unknown>
  poaProperty?: Record<string, unknown>
  poaPersonalCare?: Record<string, unknown>
  assets?: unknown[]
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
  payload: DraftSyncPayload
): Promise<boolean> {
  try {
    const res = await fetch(`/api/drafts/${draftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        about_you: payload.aboutYou,
        your_family: payload.yourFamily,
        your_estate: payload.yourEstate,
        your_arrangements: payload.yourArrangements,
        poa_property: payload.poaProperty,
        poa_personal_care: payload.poaPersonalCare,
        assets: payload.assets,
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

// Submit final draft
export async function submitDraft(draftId: string): Promise<{ submitted_at: string } | null> {
  try {
    const res = await fetch(`/api/drafts/${draftId}/submit`, { method: 'POST' })
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
  const res = await fetch(`/api/drafts?${qs}`)
  if (!res.ok) throw new Error('Failed to fetch drafts')
  return res.json()
}

// Get single draft (for lawyer dashboard detail)
export async function getDraft(draftId: string): Promise<DraftListItem & { people: unknown[]; ai_flags: unknown[] } | null> {
  try {
    const res = await fetch(`/api/drafts/${draftId}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Create magic link for new client (lawyer action)
export async function createMagicLink(params: {
  client_first_name: string
  client_last_name: string
  client_email?: string
  client_phone?: string
  language?: string
  note_for_client?: string
}): Promise<CreateLinkResponse | null> {
  try {
    const res = await fetch('/api/links/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, firm_id: 'firm_demo' }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
