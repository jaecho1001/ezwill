'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useWillForm } from '@/providers/will-form-provider'
import { saveDraftToServer } from '@/lib/api/drafts'
import type { WillDocument } from '@/lib/types/will'

// Extracts people array from the will document for server sync
function extractPeople(will: WillDocument): unknown[] {
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

  return people
}

export function useDraftSync(draftId: string | null) {
  const { will } = useWillForm()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef<string>('')

  const sync = useCallback(async (w: WillDocument) => {
    if (!draftId) return
    const snapshot = JSON.stringify({
      step: w.currentStep,
      steps: w.completedSteps,
      lang: w.language,
    })
    if (snapshot === lastSyncedRef.current) return
    lastSyncedRef.current = snapshot

    await saveDraftToServer(draftId, {
      aboutYou: w.aboutYou as unknown as Record<string, unknown>,
      yourFamily: w.yourFamily as unknown as Record<string, unknown>,
      yourEstate: w.yourEstate as unknown as Record<string, unknown>,
      yourArrangements: w.yourArrangements as unknown as Record<string, unknown>,
      poaProperty: w.poaProperty as unknown as Record<string, unknown>,
      poaPersonalCare: w.poaPersonalCare as unknown as Record<string, unknown>,
      assets: w.assets,
      people: extractPeople(w),
      aiFlags: w.aiFlags,
      currentStep: w.currentStep,
      completedSteps: w.completedSteps,
      language: w.language,
    })
  }, [draftId])

  useEffect(() => {
    if (!draftId) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => sync(will), 1500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [will, draftId, sync])
}
