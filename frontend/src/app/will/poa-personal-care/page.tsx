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

export default function POAPersonalCarePage() {
  const router = useRouter()
  const { will, dispatch } = useWillForm()
  const { t } = useTranslation()
  const [subStep, setSubStep] = useState(0)
  const data = will.poaPersonalCare

  function update(updates: Partial<typeof data>) {
    dispatch({ type: 'UPDATE_POA_PERSONAL_CARE', payload: updates })
  }

  const SUB_STEPS = ['attorney', 'wishes', 'organ-donation']

  function handleContinue() {
    if (subStep < SUB_STEPS.length - 1) setSubStep(s => s + 1)
    else {
      dispatch({ type: 'COMPLETE_STEP', payload: 6 })
      router.push('/will/assets')
    }
  }

  // Only enforce an attorney once the client has opted into this POA.
  const isCurrentValid = () =>
    subStep !== 0 || !data.hasAttorney || !!data.attorney?.firstName?.trim()

  return (
    <div className="fade-in">
      <AIFlagBanner />
      <StepHeader
        section={t.poaPersonalCare}
        title={
          subStep === 0 ? 'Attorney for Personal Care' :
          subStep === 1 ? 'Health Care Wishes' :
          'Organ Donation'
        }
        description={
          subStep === 0 ? 'This person makes health and personal care decisions if you cannot communicate.' :
          subStep === 1 ? 'Guidance for your attorney on medical decisions.' :
          'Your wishes regarding organ and tissue donation.'
        }
        step={subStep}
        totalSteps={SUB_STEPS.length}
      />

      {subStep === 0 && (
        <div className="space-y-6">
          <PersonForm
            value={data.attorney ?? {}}
            onChange={updates => update({ attorney: { ...newPerson('attorney_care'), ...data.attorney, ...updates }, hasAttorney: true })}
            showRelationship
            showEmail
            showPhone
            title="Primary Attorney for Personal Care"
          />
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Backup Attorney (optional)</p>
            <PersonForm
              value={data.backupAttorney ?? {}}
              onChange={updates => update({ backupAttorney: { ...newPerson('attorney_care'), ...data.backupAttorney, ...updates } })}
              showRelationship
            />
          </div>
        </div>
      )}

      {subStep === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Life Support Wishes</Label>
            <RadioGroup
              name="lifeSupport"
              columns={1}
              value={data.lifeSupport ?? 'attorney_decides'}
              onChange={v => update({ lifeSupport: v as typeof data.lifeSupport })}
              options={[
                { value: 'maintain', title: 'Maintain life support', description: 'I wish all reasonable measures to be taken to maintain my life.' },
                { value: 'withhold', title: 'Withhold extraordinary measures', description: 'If there is no reasonable hope of recovery, I do not want extraordinary measures.' },
                { value: 'attorney_decides', title: "Leave to my attorney's judgment", description: 'My attorney knows my values and should decide based on the circumstances.' },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Additional Care Instructions (optional)</Label>
            <Textarea
              value={data.careInstructions ?? ''}
              onChange={e => update({ careInstructions: e.target.value })}
              placeholder="e.g. I prefer to remain at home rather than in a care facility if possible. I value pain management over life extension..."
            />
          </div>
        </div>
      )}

      {subStep === 2 && (
        <div className="space-y-4">
          <RadioGroup
            name="organDonation"
            columns={2}
            value={data.organDonation === true ? 'yes' : data.organDonation === false ? 'no' : 'unspecified'}
            onChange={v => update({ organDonation: v === 'yes' ? true : v === 'no' ? false : undefined })}
            options={[
              { value: 'yes', title: 'Yes, donate my organs', icon: '❤️', description: 'Any usable organs and tissues' },
              { value: 'no', title: 'No organ donation', icon: '✗' },
              { value: 'unspecified', title: "Leave to family's discretion", icon: '👨‍👩‍👧‍👦' },
            ]}
          />
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
            Note: Also register with ServiceOntario at ontario.ca/organ-donor — registration in a Will alone may not be seen quickly enough. Your family will always be consulted.
          </p>
        </div>
      )}

      <StepNavigation
        onBack={() => subStep > 0 ? setSubStep(s => s - 1) : router.push('/will/poa-property')}
        onContinue={handleContinue}
        continueDisabled={!isCurrentValid()}
        showSkip={subStep >= 1}
        onSkip={() => subStep < SUB_STEPS.length - 1 ? setSubStep(s => s + 1) : (dispatch({ type: 'COMPLETE_STEP', payload: 6 }), router.push('/will/assets'))}
      />
    </div>
  )
}
