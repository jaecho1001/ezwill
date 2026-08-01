'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useWillForm } from '@/providers/will-form-provider'
import { useDraft } from '@/providers/draft-provider'
import { resolveLink, saveDraftToServer } from '@/lib/api/drafts'
import type { WillDocument } from '@/lib/types/will'

// Extracts people array from the will document for server sync
export function extractPeople(will: WillDocument): unknown[] {
  const people: unknown[] = []
  const { yourFamily, yourEstate, yourArrangements, poaProperty, poaPersonalCare } = will

  if (yourFamily.spouse) people.push({ ...yourFamily.spouse, role: 'spouse' })
  yourFamily.children.forEach(c => people.push({ ...c, role: 'child' }))
  yourFamily.guardians.forEach(g => people.push({ ...g, role: 'guardian' }))
  yourEstate.beneficiaries.forEach(b => people.push({ ...b, role: 'beneficiary' }))
  yourEstate.contingentBeneficiaries.forEach(b => people.push({ ...b, role: 'contingent_beneficiary' }))
  if (yourArrangements.primaryExecutor) people.push({ ...yourArrangements.primaryExecutor, role: 'executor' })
  yourArrangements.backupExecutors.forEach(e => people.push({ ...e, role: 'backup_executor' }))
  if (poaProperty.attorney) people.push({ ...poaProperty.attorney, role: 'attorney_property' })
  if (poaProperty.backupAttorney) people.push({ ...poaProperty.backupAttorney, role: 'backup_attorney' })
  if (poaPersonalCare.attorney) people.push({ ...poaPersonalCare.attorney, role: 'attorney_care' })
  if (poaPersonalCare.backupAttorney) people.push({ ...poaPersonalCare.backupAttorney, role: 'backup_attorney' })

  return people
}

export function buildDraftSyncSnapshot(will: WillDocument): string {
  return JSON.stringify({
    aboutYou: will.aboutYou,
    yourFamily: will.yourFamily,
    yourEstate: will.yourEstate,
    yourArrangements: will.yourArrangements,
    poaProperty: will.poaProperty,
    poaPersonalCare: will.poaPersonalCare,
    assets: will.assets,
    liabilities: will.liabilities,
    aiFlags: will.aiFlags,
    currentStep: will.currentStep,
    completedSteps: will.completedSteps,
    language: will.language,
  })
}

export interface DraftSyncState {
  conflict: boolean
  saveFailed: boolean
  /** Write any pending answers NOW and report whether the server has them.
   *  Callers that end the client's editing session (submit) must await this
   *  — otherwise the debounce can lose the last edits permanently (#92). */
  flush: () => Promise<boolean>
}

export function useDraftSync(): DraftSyncState {
  const { will } = useWillForm()
  const { draftId, token } = useDraft()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef<string>('')
  // Optimistic concurrency (#92): every save after the baseline is
  // conditional on the last revision this device saw, so two devices
  // editing the same draft cannot silently overwrite each other.
  const revisionRef = useRef<number | null>(null)
  const conflictRef = useRef(false)
  const [conflict, setConflict] = useState(false)
  // In-flight serialization (review finding): a second save dispatched
  // while the first is still on the wire would present the same revision
  // and 409 against our own predecessor, latching a phantom conflict.
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)
  const latestWillRef = useRef<WillDocument>(will)
  latestWillRef.current = will

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  // Revision baseline for a magic-link session. FAIL-CLOSED (Codex
  // re-review): resolveLink returns null rather than throwing, so the old
  // catch never ran and a failed lookup silently produced an
  // unconditional first write — the exact overwrite this guards against.
  // No baseline means NO save; the answers stay in local storage, the
  // banner says so, and the lookup is retried.
  const seedRef = useRef<Promise<number | null> | null>(null)

  const ensureBaseline = useCallback(async (): Promise<boolean> => {
    // Self-serve drafts have no token and no other writer to protect.
    if (!token) return true
    if (revisionRef.current !== null) return true
    if (!seedRef.current) {
      seedRef.current = resolveLink(token)
        .then((resolved) => (resolved && typeof resolved.revision === 'number'
          ? resolved.revision
          : null))
        .catch(() => null)
    }
    const revision = await seedRef.current
    if (revision === null) {
      seedRef.current = null // allow a fresh attempt on the next try
      return false
    }
    if (revisionRef.current === null) revisionRef.current = revision
    return true
  }, [token])

  const sync = useCallback(async (): Promise<boolean> => {
    if (!draftId || conflictRef.current) return false
    if (inFlightRef.current) {
      pendingRef.current = true
      return false
    }
    inFlightRef.current = true
    try {
      // A magic-link session must know the server's revision before its
      // FIRST write, or that write is an unconditional overwrite.
      if (!(await ensureBaseline())) {
        setSaveFailed(true)
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        retryTimerRef.current = setTimeout(() => { void sync() }, 10000)
        return false
      }
      const w = latestWillRef.current
      const snapshot = buildDraftSyncSnapshot(w)
      if (snapshot === lastSyncedRef.current) return true

      const result = await saveDraftToServer(draftId, {
        aboutYou: w.aboutYou as unknown as Record<string, unknown>,
        yourFamily: w.yourFamily as unknown as Record<string, unknown>,
        yourEstate: w.yourEstate as unknown as Record<string, unknown>,
        yourArrangements: w.yourArrangements as unknown as Record<string, unknown>,
        poaProperty: w.poaProperty as unknown as Record<string, unknown>,
        poaPersonalCare: w.poaPersonalCare as unknown as Record<string, unknown>,
        assets: w.assets,
        liabilities: w.liabilities,
        people: extractPeople(w),
        aiFlags: w.aiFlags,
        currentStep: w.currentStep,
        completedSteps: w.completedSteps,
        language: w.language,
      }, token ?? undefined, revisionRef.current ?? undefined)
      if (result.ok) {
        // Claim the snapshot only AFTER the server confirmed (Codex
        // re-review): claiming it up front meant a transient failure was
        // never retried — the data looked synced and silently wasn't.
        lastSyncedRef.current = snapshot
        if (result.revision != null) revisionRef.current = result.revision
        setSaveFailed(false)
        return true
      }
      if (result.conflict) {
        // Another writer got there first. STOP autosaving — retrying
        // would overwrite their answers — and surface it.
        conflictRef.current = true
        setConflict(true)
        return false
      }
      // Transient failure: surface it and retry on a timer even if the
      // client types nothing further.
      setSaveFailed(true)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      retryTimerRef.current = setTimeout(() => { void sync() }, 10000)
      return false
    } finally {
      inFlightRef.current = false
      if (pendingRef.current) {
        pendingRef.current = false
        void sync()
      }
    }
  }, [draftId, ensureBaseline, token])

  useEffect(() => {
    if (!draftId) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void sync() }, 1500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [will, draftId, sync])

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
  }, [])

  /** Cancel the debounce and write now. Awaited by submit (#92): a client
   *  who finishes and submits inside the debounce window would otherwise
   *  submit STALE server data, and the later save is refused because the
   *  questionnaire is already submitted. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // If a save is already on the wire, wait it out and write again: the
    // in-flight one may predate the client's last keystrokes.
    while (inFlightRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return sync()
  }, [sync])

  return { conflict, saveFailed, flush }
}
