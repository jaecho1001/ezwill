import { getAuthHeaders } from '@/lib/auth'

export interface SigningEvent {
  document_type: string
  signing_method: 'in_person' | 'remote_video'
  signed_at: string | null
  location: string | null
  witness1_name: string | null
  witness1_address: string | null
  witness1_occupation: string | null
  witness1_is_lso: boolean
  witness2_name: string | null
  witness2_address: string | null
  witness2_occupation: string | null
  witness2_is_lso: boolean
  platform: string | null
}

export interface SigningWitnessInput {
  name?: string
  address?: string
  occupation?: string
  is_lso?: boolean
}

export interface RecordSigningPayload {
  document_type: string
  signing_method: 'in_person' | 'remote_video'
  signed_at?: string | null
  location?: string | null
  witness1?: SigningWitnessInput
  witness2?: SigningWitnessInput
  platform?: string | null
}

export async function getSigning(draftId: string): Promise<SigningEvent[]> {
  try {
    const res = await fetch(`/api/signing/${draftId}`, { headers: { ...getAuthHeaders() } })
    if (!res.ok) return []
    const j = await res.json()
    return (j.events ?? []) as SigningEvent[]
  } catch {
    return []
  }
}

export async function recordSigning(
  draftId: string,
  payload: RecordSigningPayload,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/signing/${draftId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      return { ok: false, error: e.detail || 'Failed to record signing' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}
