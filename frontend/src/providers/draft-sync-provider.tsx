'use client'

import { createContext, useContext } from 'react'
import type { DraftSyncState } from '@/hooks/use-draft-sync'

/**
 * Shares the wizard's autosave state with the pages inside it (#92).
 *
 * The submit page must be able to FLUSH pending answers before it submits:
 * autosave is debounced, so a client who finishes and submits immediately
 * would otherwise send the server's stale copy — and the save that lands
 * afterwards is refused, because the questionnaire is already submitted.
 */
const DraftSyncContext = createContext<DraftSyncState>({
  conflict: false,
  saveFailed: false,
  flush: async () => true,
})

export const DraftSyncProvider = DraftSyncContext.Provider

export function useDraftSyncState(): DraftSyncState {
  return useContext(DraftSyncContext)
}
