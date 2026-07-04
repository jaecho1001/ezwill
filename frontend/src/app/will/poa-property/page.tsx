'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RadioGroup } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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

export default function POAPropertyPage() {
  const router = useRouter()
  const { will, dispatch } = useWillForm()
  const { t } = useTranslation()
  const [subStep, setSubStep] = useState(0)
  const data = will.poaProperty

  function update(updates: Partial<typeof data>) {
    dispatch({ type: 'UPDATE_POA_PROPERTY', payload: updates })
  }

  const SUB_STEPS = ['attorney', 'effective', 'restrictions']

  function handleContinue() {
    if (subStep < SUB_STEPS.length - 1) setSubStep(s => s + 1)
    else {
      dispatch({ type: 'COMPLETE_STEP', payload: 5 })
      router.push('/will/poa-personal-care')
    }
  }

  // Only enforce an attorney once the client has opted into this POA — never
  // block someone who is choosing not to make one.
  const isCurrentValid = () =>
    subStep !== 0 || !data.hasAttorney || !!data.attorney?.firstName?.trim()

  return (
    <div className="fade-in">
      <AIFlagBanner />
      <StepHeader
        section={t.poaProperty}
        title={
          subStep === 0 ? 'Attorney for Property' :
          subStep === 1 ? 'When Does It Take Effect?' :
          'Restrictions & Compensation'
        }
        description={
          subStep === 0 ? 'This person manages your finances (bank, real estate, investments) if you cannot.' :
          subStep === 1 ? 'A Continuing POA for Property can be effective immediately or only upon mental incapacity.' :
          'Optional restrictions or instructions for your attorney.'
        }
        step={subStep}
        totalSteps={SUB_STEPS.length}
      />

      {subStep === 0 && (
        <div className="space-y-6">
          <PersonForm
            value={data.attorney ?? {}}
            onChange={updates => update({ attorney: { ...newPerson('attorney_property'), ...data.attorney, ...updates }, hasAttorney: true })}
            showRelationship
            showEmail
            showPhone
            title="Primary Attorney"
          />
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Backup Attorney (optional)</p>
            <PersonForm
              value={data.backupAttorney ?? {}}
              onChange={updates => update({ backupAttorney: { ...newPerson('attorney_property'), ...data.backupAttorney, ...updates } })}
              showRelationship
            />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <strong>Ontario SDA s.7:</strong> An attorney for property cannot change your Will or make gifts on your behalf (unless the POA explicitly permits small gifts).
          </div>
        </div>
      )}

      {subStep === 1 && (
        <div className="space-y-4">
          <RadioGroup
            name="effective"
            columns={1}
            value={data.effectiveImmediately ? 'immediate' : 'incapacity'}
            onChange={v => update({ effectiveImmediately: v === 'immediate' })}
            options={[
              { value: 'immediate', title: 'Effective Immediately (Recommended)', description: 'Your attorney can act now and continues if you lose capacity. Most flexible — useful if travelling or hospitalized.' },
              { value: 'incapacity', title: 'Effective Only on Incapacity', description: 'Attorney can only act after a doctor certifies you are mentally incapable. Requires assessment process — can cause delays in emergencies.' },
            ]}
          />
        </div>
      )}

      {subStep === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Restrictions (optional)</Label>
            <Textarea
              value={data.restrictions ?? ''}
              onChange={e => update({ restrictions: e.target.value })}
              placeholder="e.g. My attorney cannot sell my principal residence without court approval..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Compensation</Label>
            <Textarea
              value={data.compensation ?? ''}
              onChange={e => update({ compensation: e.target.value })}
              placeholder="e.g. My attorney shall be entitled to reasonable compensation as permitted by the SDA... (or leave blank for no compensation)"
            />
          </div>
        </div>
      )}

      <StepNavigation
        onBack={() => subStep > 0 ? setSubStep(s => s - 1) : router.push('/will/your-arrangements')}
        onContinue={handleContinue}
        continueDisabled={!isCurrentValid()}
        showSkip={subStep === 2}
        onSkip={() => { dispatch({ type: 'COMPLETE_STEP', payload: 5 }); router.push('/will/poa-personal-care') }}
      />
    </div>
  )
}
