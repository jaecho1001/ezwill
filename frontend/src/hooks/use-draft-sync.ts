'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useWillForm } from '@/providers/will-form-provider'
import { useDraft } from '@/providers/draft-provider'
import { saveDraftToServer } from '@/lib/api/drafts'
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

export function useDraftSync(): { conflict: boolean } {
  const { will } = useWillForm()
  const { draftId, token } = useDraft()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef<string>('')
  // Optimistic concurrency (#92): the first save is unconditional (this
  // wizard hydrates locally, not from the server), but every save after it
  // is conditional on the revision the previous save returned — so two
  // devices editing the same draft can no longer silently overwrite each
  // other for the rest of the session.
  const revisionRef = useRef<number | null>(null)
  const conflictRef = useRef(false)
  const [conflict, setConflict] = useState(false)

  const sync = useCallback(async (w: WillDocument) => {
    if (!draftId || conflictRef.current) return
    const snapshot = buildDraftSyncSnapshot(w)
    if (snapshot === lastSyncedRef.current) return
    lastSyncedRef.current = snapshot

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
      if (result.revision != null) revisionRef.current = result.revision
    } else if (result.conflict) {
      // Another device wrote since we did. STOP autosaving — retrying
      // would overwrite the other device's answers — and surface it.
      conflictRef.current = true
      setConflict(true)
    }
  }, [draftId, token])

  useEffect(() => {
    if (!draftId) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => sync(will), 1500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [will, draftId, sync])

  return { conflict }
}
