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
import { householdPersonSuggestions } from '@/lib/person-suggestions'
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
          subStep === 0 ? t.poaProp_titleAttorney :
          subStep === 1 ? t.poaProp_titleEffective :
          t.poaProp_titleRestrictions
        }
        description={
          subStep === 0 ? t.poaProp_descAttorney :
          subStep === 1 ? t.poaProp_descEffective :
          t.poaProp_descRestrictions
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
            title={t.poaProp_primaryAttorney}
            suggestions={householdPersonSuggestions(will, 'attorney_property', [data.backupAttorney])}
          />
          {!!data.attorney?.firstName?.trim() && <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">{t.poaProp_backupAttorneyOptional}</p>
            <PersonForm
              value={data.backupAttorney ?? {}}
              onChange={updates => update({ backupAttorney: { ...newPerson('attorney_property'), ...data.backupAttorney, ...updates } })}
              showRelationship
              showEmail
              showPhone
              suggestions={householdPersonSuggestions(will, 'attorney_property', [data.attorney])}
            />
          </div>}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <strong>{t.poaProp_sdaNoteLabel}</strong> {t.poaProp_sdaNoteBody}
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
              { value: 'immediate', title: t.poaProp_immediateTitle, description: t.poaProp_immediateDesc },
              { value: 'incapacity', title: t.poaProp_incapacityTitle, description: t.poaProp_incapacityDesc },
            ]}
          />
        </div>
      )}

      {subStep === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.poaProp_restrictionsLabel}</Label>
            <Textarea
              value={data.restrictions ?? ''}
              onChange={e => update({ restrictions: e.target.value })}
              placeholder={t.poaProp_restrictionsPlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.poaProp_compensationLabel}</Label>
            <Textarea
              value={data.compensation ?? ''}
              onChange={e => update({ compensation: e.target.value })}
              placeholder={t.poaProp_compensationPlaceholder}
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
