'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDraft } from '@/providers/draft-provider'
import { saveVaultToServer } from '@/lib/api/drafts'
import type { WillVault } from '@/types/will-vault'

export type VaultSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

/**
 * Debounced server autosave. The local store is only a resilience copy.
 *
 * Concurrency (issue #92): every save presents the revision this device last
 * saw; the server refuses with 409 when another device (or the lawyer) wrote
 * in between. On conflict we STOP autosaving — continuing would either spin
 * on 409s or, worse, overwrite the other writer — and hand control to the
 * page via onConflict so it can re-hydrate and resume.
 */
export function useVaultSync(
  vault: WillVault,
  enabled = true,
  expectedDraftId?: string,
  onConflict?: () => void,
) {
  const { draftId, token } = useDraft()
  const [status, setStatus] = useState<VaultSaveStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef('')
  const revisionRef = useRef<number | undefined>(undefined)
  const conflicted = useRef(false)

  /** The page sets this after hydration (and again after conflict re-hydration). */
  const acceptRevision = useCallback((revision: number | undefined) => {
    revisionRef.current = revision
    conflicted.current = false
    setStatus('idle')
  }, [])

  const save = useCallback(async () => {
    if (!enabled || !draftId || conflicted.current) return false
    if (expectedDraftId && draftId !== expectedDraftId) return false
    const snapshot = JSON.stringify(vault)
    if (snapshot === lastSaved.current) return true
    setStatus('saving')
    const result = await saveVaultToServer(
      draftId,
      vault as unknown as Record<string, unknown>,
      undefined,
      token ?? undefined,
      false,
      revisionRef.current,
    )
    if (result.ok) {
      lastSaved.current = snapshot
      revisionRef.current = result.revision ?? revisionRef.current
      setStatus('saved')
      return true
    }
    if (result.conflict) {
      conflicted.current = true
      setStatus('conflict')
      onConflict?.()
      return false
    }
    setStatus('error')
    return false
  }, [draftId, enabled, expectedDraftId, onConflict, token, vault])

  useEffect(() => {
    if (!enabled || !draftId || (expectedDraftId && draftId !== expectedDraftId)) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void save() }, 1200)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [draftId, enabled, expectedDraftId, save, vault])

  return { status, retry: save, acceptRevision }
}
