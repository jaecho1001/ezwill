'use client'
import * as React from 'react'

interface DraftContextValue {
  draftId: string | null
  setDraftId: (id: string) => void
  /** Token for the ACTIVE draft (null when that draft has none). */
  token: string | null
  /** Store a token. Pass the draft id when the active draft may not be set
   *  yet (e.g. a magic-link arrival sets the token before the id). */
  setToken: (token: string, forDraftId?: string) => void
  /** Token for a specific draft, regardless of which one is active. */
  tokenForDraft: (draftId: string) => string | null
}

const ACTIVE_KEY = 'ew_draft_id'
const TOKENS_KEY = 'ew_draft_tokens'
const LEGACY_TOKEN_KEY = 'ew_token'

/**
 * Client credentials are stored PER DRAFT (#91, Codex re-review).
 *
 * A single global token/draft pair meant that opening a second draft
 * silently destroyed the first draft's refresh recovery — the client
 * reloads and their link no longer resolves, and a self-serve session can
 * strand a duplicate draft. Storage stays in localStorage, not
 * sessionStorage: clients legitimately close the browser and come back to
 * an unfinished questionnaire days later.
 */
function readTokens(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(TOKENS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const map: Record<string, string> = {}
    if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') map[key] = value
      }
    }
    // Migrate the pre-per-draft pair so in-flight clients keep their link.
    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY)
    const legacyDraft = localStorage.getItem(ACTIVE_KEY)
    if (legacyToken && legacyDraft && !map[legacyDraft]) {
      map[legacyDraft] = legacyToken
      localStorage.setItem(TOKENS_KEY, JSON.stringify(map))
      localStorage.removeItem(LEGACY_TOKEN_KEY)
    }
    return map
  } catch {
    return {}
  }
}

function writeTokens(map: Record<string, string>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(map))
  } catch {
    // Storage full or blocked: the in-memory copy still serves this session.
  }
}

const DraftContext = React.createContext<DraftContextValue>({
  draftId: null,
  setDraftId: () => {},
  token: null,
  setToken: () => {},
  tokenForDraft: () => null,
})

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [draftId, setDraftIdState] = React.useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(ACTIVE_KEY)
  })
  const [tokens, setTokens] = React.useState<Record<string, string>>(() => readTokens())

  const setDraftId = React.useCallback((id: string) => {
    setDraftIdState(id)
    if (typeof window !== 'undefined') localStorage.setItem(ACTIVE_KEY, id)
  }, [])

  const setToken = React.useCallback((t: string, forDraftId?: string) => {
    setTokens((prev) => {
      const key = forDraftId
        ?? (typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null)
      if (!key) return prev
      const next = { ...prev, [key]: t }
      writeTokens(next)
      return next
    })
  }, [])

  const tokenForDraft = React.useCallback(
    (id: string) => tokens[id] ?? null,
    [tokens]
  )

  const token = draftId ? tokens[draftId] ?? null : null

  return (
    <DraftContext.Provider
      value={{ draftId, setDraftId, token, setToken, tokenForDraft }}
    >
      {children}
    </DraftContext.Provider>
  )
}

export function useDraft() {
  return React.useContext(DraftContext)
}
