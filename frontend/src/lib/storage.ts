import type { WillDocument } from './types/will'

const STORAGE_KEY = 'ezwill_draft'

export function loadDraft(): WillDocument | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as WillDocument
  } catch {
    return null
  }
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
