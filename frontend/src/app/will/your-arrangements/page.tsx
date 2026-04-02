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

  return (
    <div className="fade-in">
      <AIFlagBanner />
      <StepHeader
        section={t.yourArrangements}
        title={
          subStep === 0 ? t.executor :
          subStep === 1 ? 'Backup Executors' :
          subStep === 2 ? t.restingPlace :
          t.ceremonyWishes
        }
        description={
          subStep === 0 ? t.executorDescription :
          subStep === 1 ? 'If your primary executor cannot act, who should step in?' :
          subStep === 2 ? 'What are your wishes for your remains?' :
          'Any wishes about your funeral or memorial service (optional).'
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
            title="Primary Executor"
          />
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>Tip:</strong> Choose someone organized, trustworthy, and ideally in Ontario. They will manage your estate — filing taxes, paying debts, and distributing assets. Being an executor can take 1-2 years.
          </div>
        </div>
      )}

      {subStep === 1 && (
        <div className="space-y-4">
          {data.backupExecutors.map((exec, i) => (
            <div key={exec.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <p className="text-sm font-medium">Backup {i + 1}</p>
                <button onClick={() => update({ backupExecutors: data.backupExecutors.filter(e => e.id !== exec.id) })} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
              <PersonForm value={exec} onChange={updates => update({ backupExecutors: data.backupExecutors.map(e => e.id === exec.id ? { ...e, ...updates } : e) })} showRelationship showEmail />
            </div>
          ))}
          <Button variant="outline" className="w-full gap-2" onClick={() => update({ backupExecutors: [...data.backupExecutors, newPerson('executor')] })}>
            <Plus className="h-4 w-4" /> Add Backup Executor
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
            { value: 'burial', title: 'Burial', icon: '⚱️' },
            { value: 'cremation', title: 'Cremation', icon: '🕯️' },
            { value: 'donation', title: 'Body Donation to Science', icon: '🔬' },
            { value: 'not_specified', title: "Leave to executor's discretion", icon: '📋' },
          ]}
        />
      )}

      {subStep === 3 && (
        <div className="space-y-3">
          <Label>Ceremony Wishes (optional)</Label>
          <Textarea
            value={data.ceremonyWishes ?? ''}
            onChange={e => update({ ceremonyWishes: e.target.value })}
            placeholder="e.g. I would like a small gathering of close family and friends. No formal service. Please play my favourite music..."
            className="min-h-[120px]"
          />
          <p className="text-xs text-gray-400">Note: While your Will can express wishes, your executor has discretion. Consider also leaving a separate letter with detailed instructions.</p>
        </div>
      )}

      <StepNavigation
        onBack={() => subStep > 0 ? setSubStep(s => s - 1) : router.push('/will/your-estate')}
        onContinue={handleContinue}
        showSkip={subStep === 3}
        onSkip={() => { dispatch({ type: 'COMPLETE_STEP', payload: 4 }); router.push('/will/poa-property') }}
      />
    </div>
  )
}
