/**
 * Deterministic, dependency-free extractor used when the Claude API is
 * unreachable. Mirrors a subset of the backend's regex fallback so the UX
 * still advances. Never mutates state — returns a list of proposed patches
 * that the caller applies through the same vault store it uses for the
 * SSE path, keeping the two code paths structurally identical.
 */

import type { WillVault } from '@/types/will-vault'

export type MockPatch =
  | { kind: 'scalar'; path: string; value: string | number | boolean }
  | {
      kind: 'list_append'
      list_path: 'children' | 'executors' | 'guardians' | 'beneficiaries'
      item: Record<string, unknown>
    }

export interface MockResult {
  patches: MockPatch[]
  assistantText: string
}

const NAME_RE = /(?:i(?:'| a)m|my name is|i am)\s+([A-Z][a-zA-Z\- ]{1,40})/i
const SPOUSE_RE = /(?:married to|my (?:wife|husband|spouse|partner) is)\s+([A-Z][a-zA-Z\- ]{1,40})/i
const CHILDREN_RE = /(?:children(?: are)?|kids(?: are)?)\s*[:,]?\s*([A-Z][A-Za-z,\- and]+)/i
const ADDRESS_RE = /(?:i live at|address is|lives? at)\s+([^.]+)/i
const DOB_RE = /(?:born on|birthday|dob)\s+(\d{4}-\d{2}-\d{2}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
const BOOL_RULES: Array<{ re: RegExp; path: string; value: boolean }> = [
  { re: /\b(dual will|two wills|secondary will)\b/i, path: 'goals.hasDualWill', value: true },
  { re: /\b(poa (?:for )?property|power of attorney for property)\b/i, path: 'goals.hasPoaProperty', value: true },
  { re: /\b(personal care poa|poa (?:for )?personal care)\b/i, path: 'goals.hasPoaPersonalCare', value: true },
  { re: /\b(private (?:company|corp|corporation) shares?|private-co shares?)\b/i, path: 'assets.privateCompanyShares', value: true },
  { re: /\b(on(?: the)? odsp|disability benefits?)\b/i, path: 'goals.henson', value: true },
  { re: /\b(charitable|charity donation|leave to charity)\b/i, path: 'goals.charitableGiving', value: true },
]

export function extractFromMessage(message: string, vault: WillVault): MockResult {
  const patches: MockPatch[] = []

  const nameMatch = message.match(NAME_RE)
  if (nameMatch && !vault.testator.fullName) {
    patches.push({ kind: 'scalar', path: 'testator.fullName', value: nameMatch[1].trim() })
  }

  const spouseMatch = message.match(SPOUSE_RE)
  if (spouseMatch) {
    patches.push({ kind: 'scalar', path: 'spouse.included', value: true })
    patches.push({ kind: 'scalar', path: 'spouse.fullName', value: spouseMatch[1].trim() })
  }

  const childrenMatch = message.match(CHILDREN_RE)
  if (childrenMatch) {
    const names = childrenMatch[1]
      .split(/,|\band\b/i)
      .map((s) => s.trim())
      .filter((n) => /^[A-Z][A-Za-z\- ]{1,40}$/.test(n))
    for (const fullName of names) {
      if (!vault.children.some((c) => c.fullName === fullName)) {
        patches.push({ kind: 'list_append', list_path: 'children', item: { fullName } })
      }
    }
  }

  const addressMatch = message.match(ADDRESS_RE)
  if (addressMatch && !vault.testator.address) {
    patches.push({ kind: 'scalar', path: 'testator.address', value: addressMatch[1].trim() })
  }

  const dobMatch = message.match(DOB_RE)
  if (dobMatch && !vault.testator.dob) {
    const iso = normalizeDob(dobMatch[1])
    if (iso) patches.push({ kind: 'scalar', path: 'testator.dob', value: iso })
  }

  for (const rule of BOOL_RULES) {
    if (rule.re.test(message)) {
      patches.push({ kind: 'scalar', path: rule.path, value: rule.value })
    }
  }

  const assistantText = patches.length
    ? `Recorded ${patches.length} item${patches.length === 1 ? '' : 's'} from your message. What else should I know?`
    : `I couldn't parse anything concrete from that. Try: "I'm Jane Doe, married to Alex, two kids Sam and Riley."`

  return { patches, assistantText }
}

function normalizeDob(raw: string): string | null {
  // Already ISO.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
