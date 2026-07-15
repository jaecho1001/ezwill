/**
 * Jurisdiction registry — the single source of truth for per-jurisdiction constants
 * on the frontend. Mirrors `backend/services/jurisdictions.py`; keep the two in sync.
 *
 * Ontario (`CA-ON`) is the only jurisdiction today. Every jurisdiction-specific
 * value (age of majority, terminology, statutes, probate fees) should flow through
 * here so adding a province/state is a config entry, not scattered code edits.
 * See `JURISDICTION_AUDIT.md`.
 */

export interface Jurisdiction {
  code: string // ISO-ish, e.g. "CA-ON"
  name: string // "Ontario"
  country: string // "Canada"
  ageOfMajority: number // 18 in ON; 19 in BC — used by isMinor
  estateTrusteeTerm: string // "Estate Trustee" (ON) vs "Executor"
  probateCertificateTerm: string
  willsStatute: string
  separationVoidYears: number | null // SLRA s.17 → 3
  probateFeeRate: number
  probateFeeThreshold: number
  disabilityAssetLimit: number | null // ODSP → Henson trust
}

const REGISTRY: Record<string, Jurisdiction> = {
  'CA-ON': {
    code: 'CA-ON',
    name: 'Ontario',
    country: 'Canada',
    ageOfMajority: 18,
    estateTrusteeTerm: 'Estate Trustee',
    probateCertificateTerm: 'Certificate of Appointment of Estate Trustee',
    willsStatute: 'Succession Law Reform Act (SLRA), R.S.O. 1990, c. S.26',
    separationVoidYears: 3,
    probateFeeRate: 0.015,
    probateFeeThreshold: 50_000,
    disabilityAssetLimit: 40_000,
  },
}

export const DEFAULT_JURISDICTION_CODE = 'CA-ON'

const ALIASES: Record<string, string> = {
  on: 'CA-ON',
  ontario: 'CA-ON',
  'ca-on': 'CA-ON',
}

/** Resolve a draft's `province` value (or a registry code) to a Jurisdiction,
 *  defaulting to Ontario. The ONE place a missing/unknown province defaults. */
export function resolveJurisdiction(province?: string | null): Jurisdiction {
  const key = (province ?? '').trim().toLowerCase()
  return REGISTRY[ALIASES[key] ?? DEFAULT_JURISDICTION_CODE]
}

export function getJurisdiction(code: string): Jurisdiction {
  return REGISTRY[code] ?? REGISTRY[DEFAULT_JURISDICTION_CODE]
}

export function supportedJurisdictionCodes(): string[] {
  return Object.keys(REGISTRY)
}
