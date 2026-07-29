/**
 * Vault fallbacks for the client-file estate panels (#87).
 *
 * AI-intake clients have no legacy `your_estate` record, so the beneficiary
 * chart and the gift list rendered empty for them even though the answers
 * exist in the canonical vault. Legacy data still wins when present — these
 * are fallbacks, not replacements.
 */

export interface ChartBeneficiary {
  name: string
  relationship: string
  percentage: number
}

export interface EstateGiftRow {
  id: string
  type: string
  description: string
  recipientName?: string
  charityName?: string
  amount?: number
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}

export function vaultBeneficiariesForChart(
  vault: Record<string, unknown> | undefined
): ChartBeneficiary[] {
  const named = asRecords(vault?.beneficiaries).filter(
    (b) => typeof b.fullName === 'string' && (b.fullName as string).trim()
  )
  if (named.length === 0) return []
  const allExplicit = named.every((b) => typeof b.sharePercent === 'number')
  if (allExplicit) {
    return named.map((b) => ({
      name: (b.fullName as string).trim(),
      relationship: String(b.relationship ?? ''),
      percentage: b.sharePercent as number,
    }))
  }
  // No (or partial) explicit shares: show an equal split, same convention
  // as the legacy chart fallback.
  const share = Math.floor(100 / named.length)
  return named.map((b, i) => ({
    name: (b.fullName as string).trim(),
    relationship: String(b.relationship ?? ''),
    percentage: i === named.length - 1 ? 100 - share * (named.length - 1) : share,
  }))
}

export function vaultGiftRows(
  vault: Record<string, unknown> | undefined
): EstateGiftRow[] {
  return asRecords(vault?.gifts)
    .filter((g) => g.description || g.charityName)
    .map((g) => ({
      id: String(g.id ?? ''),
      type: String(g.type ?? ''),
      description: String(g.description ?? ''),
      recipientName: g.recipientName ? String(g.recipientName) : undefined,
      charityName: g.charityName ? String(g.charityName) : undefined,
      amount: typeof g.amount === 'number' ? g.amount : undefined,
    }))
}
