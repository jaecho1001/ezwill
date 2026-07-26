'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDraft } from '@/providers/draft-provider'
import { saveVaultToServer } from '@/lib/api/drafts'
import type { WillVault } from '@/types/will-vault'

export type VaultSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** Debounced server autosave. The local store is only a resilience copy. */
export function useVaultSync(vault: WillVault, enabled = true, expectedDraftId?: string) {
  const { draftId, token } = useDraft()
  const [status, setStatus] = useState<VaultSaveStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef('')

  const save = useCallback(async () => {
    if (!enabled || !draftId || (expectedDraftId && draftId !== expectedDraftId)) return false
    const snapshot = JSON.stringify(vault)
    if (snapshot === lastSaved.current) return true
    setStatus('saving')
    const ok = await saveVaultToServer(
      draftId,
      vault as unknown as Record<string, unknown>,
      undefined,
      token ?? undefined,
    )
    if (ok) {
      lastSaved.current = snapshot
      setStatus('saved')
    } else {
      setStatus('error')
    }
    return ok
  }, [draftId, enabled, expectedDraftId, token, vault])

  useEffect(() => {
    if (!enabled || !draftId || (expectedDraftId && draftId !== expectedDraftId)) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void save() }, 1200)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [draftId, enabled, expectedDraftId, save, vault])

  return { status, retry: save }
}
