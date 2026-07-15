import { INITIAL_WILL, type WillDocument } from './types/will'

const STORAGE_KEY = 'ezwill_draft'

export function loadDraft(): WillDocument | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return migrateDraft(JSON.parse(raw))
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Merge a persisted draft with today's schema while rejecting incompatible values. */
function mergeWithDefaults(defaultValue: unknown, savedValue: unknown): unknown {
  // Optional schema fields are represented by undefined in INITIAL_WILL; retain
  // their persisted value because there is no more specific runtime shape here.
  if (defaultValue === undefined) return savedValue
  if (Array.isArray(defaultValue)) return Array.isArray(savedValue) ? savedValue : structuredClone(defaultValue)
  if (isRecord(defaultValue)) {
    const saved = isRecord(savedValue) ? savedValue : {}
    const merged: Record<string, unknown> = { ...saved }
    for (const [key, value] of Object.entries(defaultValue)) {
      merged[key] = mergeWithDefaults(value, saved[key])
    }
    return merged
  }
  if (defaultValue === null) return savedValue === null ? null : defaultValue
  return typeof savedValue === typeof defaultValue ? savedValue : defaultValue
}

export function migrateDraft(value: unknown): WillDocument | null {
  if (!isRecord(value)) return null
  return mergeWithDefaults(INITIAL_WILL, value) as WillDocument
}

export function saveDraft(will: WillDocument): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(will))
  } catch {
    console.warn('Failed to save draft to localStorage')
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
