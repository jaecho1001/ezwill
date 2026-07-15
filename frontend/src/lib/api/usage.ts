import { getAuthHeaders } from '@/lib/auth'

export const USAGE_RANGE_DAYS = [7, 30, 90, 0] as const

export type UsageRangeDays = (typeof USAGE_RANGE_DAYS)[number]

export interface TokenTotals {
  events: number
  requests: number
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  total_tokens: number
}

export interface UsageRange {
  days: number
  since: string | null
  tracked_since: string | null
}

export interface UsageByModel extends TokenTotals {
  provider: string
  model: string
}

export interface DailyUsage extends TokenTotals {
  date: string
}

export interface UsageEvent {
  id: string
  draft_id: string | null
  client_name: string | null
  provider: string
  model: string
  feature: string
  request_count: number
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  total_tokens: number
  latency_ms: number | null
  created_at: string
}

export interface UsageReport {
  generated_at: string
  range: UsageRange
  totals: TokenTotals
  all_time: TokenTotals
  by_model: UsageByModel[]
  daily: DailyUsage[]
  recent: UsageEvent[]
}

export async function getUsageReport(
  days: UsageRangeDays,
  limit = 50,
  signal?: AbortSignal,
): Promise<UsageReport> {
  const params = new URLSearchParams({
    days: String(days),
    limit: String(limit),
  })
  const response = await fetch(`/api/usage?${params}`, {
    headers: { ...getAuthHeaders() },
    signal,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail || 'Failed to load AI usage')
  }

  return response.json() as Promise<UsageReport>
}
