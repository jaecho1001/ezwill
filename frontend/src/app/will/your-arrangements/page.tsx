'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup } from '@/components/ui/radio-group'
import { StepHeader } from '@/components/will/step-header'
import { StepNavigation } from '@/components/will/step-navigation'
import { AIFlagBanner } from '@/components/will/ai-flag-banner'
import { PersonForm } from '@/components/will/person-form'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import { householdPersonSuggestions } from '@/lib/person-suggestions'
import type { PersonData } from '@/lib/types/will'

function newPerson(role: PersonData['role']): PersonData {
  return { id: crypto.randomUUID(), role, firstName: '', lastName: '' }
}

export default function YourArrangementsPage() {
  const router = useRouter()
  const { will, dispatch } = useWillForm()
  const { t } = useTranslation()
  const [subStep, setSubStep] = useState(0)
  const data = will.yourArrangements

  function update(updates: Partial<typeof data>) {
    dispatch({ type: 'UPDATE_ARRANGEMENTS', payload: updates })
  }

  const SUB_STEPS = ['executor', 'backup-executors', 'resting-place', 'ceremony']

  function handleContinue() {
    if (subStep < SUB_STEPS.length - 1) setSubStep(s => s + 1)
    else {
      dispatch({ type: 'COMPLETE_STEP', payload: 4 })
      router.push('/will/poa-property')
    }
  }

  // A will needs an executor — require a name before leaving that sub-step.
  const isCurrentValid = () =>
    subStep !== 0 || !!data.primaryExecutor?.firstName?.trim()

  return (
    <div className="fade-in">
      <AIFlagBanner />
      <StepHeader
        section={t.yourArrangements}
        title={
          subStep === 0 ? t.executor :
          subStep === 1 ? t.arr_backupExecutors :
          subStep === 2 ? t.restingPlace :
          t.ceremonyWishes
        }
        description={
          subStep === 0 ? t.executorDescription :
          subStep === 1 ? t.arr_backupExecutorsDescription :
          subStep === 2 ? t.arr_restingPlaceDescription :
          t.arr_ceremonyDescription
        }
        step={subStep}
        totalSteps={SUB_STEPS.length}
      />

      {subStep === 0 && (
        <div className="space-y-4">
          <PersonForm
            value={data.primaryExecutor ?? {}}
            onChange={updates => update({ primaryExecutor: { ...newPerson('executor'), ...data.primaryExecutor, ...updates } })}
            showRelationship
            showEmail
            showPhone
            title={t.arr_primaryExecutor}
            suggestions={householdPersonSuggestions(will, 'executor', data.backupExecutors)}
          />
          <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/40 rounded-lg p-3 text-xs text-[#8a6a1e]">
            <strong>{t.arr_tipLabel}</strong> {t.arr_executorTip}
          </div>
        </div>
      )}

      {subStep === 1 && (
        <div className="space-y-4">
          {data.backupExecutors.map((exec, i) => (
            <div key={exec.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <p className="text-sm font-medium">{t.arr_backup} {i + 1}</p>
                <button onClick={() => update({ backupExecutors: data.backupExecutors.filter(e => e.id !== exec.id) })} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
              <PersonForm
                value={exec}
                onChange={updates => update({ backupExecutors: data.backupExecutors.map(e => e.id === exec.id ? { ...e, ...updates } : e) })}
                showRelationship
                showEmail
                showPhone
                suggestions={householdPersonSuggestions(will, 'executor', [data.primaryExecutor, ...data.backupExecutors.filter(e => e.id !== exec.id)])}
              />
            </div>
          ))}
          <Button variant="outline" className="w-full gap-2" onClick={() => update({ backupExecutors: [...data.backupExecutors, newPerson('executor')] })}>
            <Plus className="h-4 w-4" /> {t.arr_addBackupExecutor}
          </Button>
        </div>
      )}

      {subStep === 2 && (
        <RadioGroup
          name="restingPlace"
          columns={2}
          value={data.restingPlace}
          onChange={v => update({ restingPlace: v as typeof data.restingPlace })}
          options={[
            { value: 'burial', title: t.arr_burial, icon: '⚱️' },
            { value: 'cremation', title: t.arr_cremation, icon: '🕯️' },
            { value: 'donation', title: t.arr_bodyDonation, icon: '🔬' },
            { value: 'not_specified', title: t.arr_executorDiscretion, icon: '📋' },
          ]}
        />
      )}

      {subStep === 3 && (
        <div className="space-y-3">
          <Label>{t.arr_ceremonyWishesLabel}</Label>
          <Textarea
            value={data.ceremonyWishes ?? ''}
            onChange={e => update({ ceremonyWishes: e.target.value })}
            placeholder={t.arr_ceremonyPlaceholder}
            className="min-h-[120px]"
          />
          <p className="text-xs text-gray-400">{t.arr_ceremonyNote}</p>
        </div>
      )}

      <StepNavigation
        onBack={() => subStep > 0 ? setSubStep(s => s - 1) : router.push('/will/your-estate')}
        onContinue={handleContinue}
        continueDisabled={!isCurrentValid()}
        showSkip={subStep === 3}
        onSkip={() => { dispatch({ type: 'COMPLETE_STEP', payload: 4 }); router.push('/will/poa-property') }}
      />
    </div>
  )
}
