'use client'
import { useEffect, useRef } from 'react'
import { useDraft } from '@/providers/draft-provider'
import { useWillForm } from '@/providers/will-form-provider'
import { createSelfServeDraft } from '@/lib/api/drafts'

/**
 * Ensure a backend draft exists for the current client so autosave + submit work.
 *
 * - Magic-link clients already have a draft (resolved on the landing page).
 * - A self-serve client who started from "Start My Will" has no draft yet — we
 *   create one here (public, rate-limited endpoint) and store its id + token.
 *
 * Once the draft id is set, `useDraftSync` immediately pushes whatever the client
 * has already entered, so the lawyer sees the answers fill in live.
 */
export function useEnsureSelfServeDraft() {
  const { draftId, setDraftId, setToken } = useDraft()
  const { will } = useWillForm()
  const started = useRef(false)

  useEffect(() => {
    if (draftId || started.current) return
    started.current = true
    createSelfServeDraft(will.language).then((res) => {
      if (res) {
        setDraftId(res.draft_id)
        setToken(res.token)
      } else {
        // creation failed (offline / rate-limited) — allow a retry on next change
        started.current = false
      }
    })
  }, [draftId, will.language, setDraftId, setToken])

  return { draftId, ready: Boolean(draftId) }
}
