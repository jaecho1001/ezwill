import { getAuthHeaders } from '@/lib/auth'

export interface PricingTier {
  id: string
  name: string
  amount_cents: number
  currency: string
  description: string
  features: string[]
}

export interface PaymentStatus {
  payment_status: 'unpaid' | 'pending' | 'paid' | 'refunded'
  payment_tier: string | null
  paid_at: string | null
}

// Client checkout uses the draft's magic token; the lawyer dashboard uses its
// bearer session.
function authHeaders(magicToken?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (magicToken) h['X-Magic-Token'] = magicToken
  else Object.assign(h, getAuthHeaders())
  return h
}

export async function getTiers(): Promise<{ tiers: PricingTier[]; processor: 'stripe' | 'simulated' }> {
  try {
    const res = await fetch('/api/payments/tiers')
    if (!res.ok) return { tiers: [], processor: 'simulated' }
    return res.json()
  } catch {
    return { tiers: [], processor: 'simulated' }
  }
}

export async function getPaymentStatus(draftId: string, magicToken?: string): Promise<PaymentStatus | null> {
  try {
    const res = await fetch(`/api/payments/${draftId}`, { headers: authHeaders(magicToken) })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function createCheckout(
  draftId: string,
  tier: string,
  magicToken?: string,
): Promise<{ url: string; simulated: boolean } | null> {
  try {
    const res = await fetch(`/api/payments/checkout/${draftId}`, {
      method: 'POST',
      headers: authHeaders(magicToken),
      body: JSON.stringify({ tier }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function confirmSimulatedPayment(draftId: string, magicToken?: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/payments/confirm/${draftId}`, {
      method: 'POST',
      headers: authHeaders(magicToken),
    })
    return res.ok
  } catch {
    return false
  }
}
