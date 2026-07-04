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
          subStep === 0 ? t.poaCare_attorneyTitle :
          subStep === 1 ? t.poaCare_wishesTitle :
          t.poaCare_organTitle
        }
        description={
          subStep === 0 ? t.poaCare_attorneyDesc :
          subStep === 1 ? t.poaCare_wishesDesc :
          t.poaCare_organDesc
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
            title={t.poaCare_primaryAttorney}
          />
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">{t.poaCare_backupAttorney}</p>
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
            <Label>{t.poaCare_lifeSupportLabel}</Label>
            <RadioGroup
              name="lifeSupport"
              columns={1}
              value={data.lifeSupport ?? 'attorney_decides'}
              onChange={v => update({ lifeSupport: v as typeof data.lifeSupport })}
              options={[
                { value: 'maintain', title: t.poaCare_maintainTitle, description: t.poaCare_maintainDesc },
                { value: 'withhold', title: t.poaCare_withholdTitle, description: t.poaCare_withholdDesc },
                { value: 'attorney_decides', title: t.poaCare_attorneyDecidesTitle, description: t.poaCare_attorneyDecidesDesc },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.poaCare_careInstructionsLabel}</Label>
            <Textarea
              value={data.careInstructions ?? ''}
              onChange={e => update({ careInstructions: e.target.value })}
              placeholder={t.poaCare_careInstructionsPlaceholder}
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
              { value: 'yes', title: t.poaCare_donateYesTitle, icon: '❤️', description: t.poaCare_donateYesDesc },
              { value: 'no', title: t.poaCare_donateNoTitle, icon: '✗' },
              { value: 'unspecified', title: t.poaCare_donateFamilyTitle, icon: '👨‍👩‍👧‍👦' },
            ]}
          />
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
            {t.poaCare_organNote}
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
