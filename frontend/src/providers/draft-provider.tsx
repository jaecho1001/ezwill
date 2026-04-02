'use client'
import * as React from 'react'

interface DraftContextValue {
  draftId: string | null
  setDraftId: (id: string) => void
  token: string | null
  setToken: (token: string) => void
}

const DraftContext = React.createContext<DraftContextValue>({
  draftId: null,
  setDraftId: () => {},
  token: null,
  setToken: () => {},
})

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [draftId, setDraftIdState] = React.useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('ew_draft_id')
  })
  const [token, setTokenState] = React.useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('ew_token')
  })

  const setDraftId = React.useCallback((id: string) => {
    setDraftIdState(id)
    if (typeof window !== 'undefined') localStorage.setItem('ew_draft_id', id)
  }, [])

  const setToken = React.useCallback((t: string) => {
    setTokenState(t)
    if (typeof window !== 'undefined') localStorage.setItem('ew_token', t)
  }, [])

  return (
    <DraftContext.Provider value={{ draftId, setDraftId, token, setToken }}>
      {children}
    </DraftContext.Provider>
  )
}

export function useDraft() {
  return React.useContext(DraftContext)
}
