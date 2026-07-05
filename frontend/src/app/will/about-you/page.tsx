'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { StepHeader } from '@/components/will/step-header'
import { StepNavigation } from '@/components/will/step-navigation'
import { AIFlagBanner } from '@/components/will/ai-flag-banner'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'

const PROVINCES = [
  { value: 'ON', label: 'Ontario' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'AB', label: 'Alberta' },
  { value: 'QC', label: 'Quebec' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland & Labrador' },
  { value: 'PE', label: 'Prince Edward Island' },
]

const SUB_STEPS = ['legal-name', 'dob', 'location', 'contact']

export default function AboutYouPage() {
  const router = useRouter()
  const { will, dispatch } = useWillForm()
  const { t } = useTranslation()
  const [subStep, setSubStep] = useState(0)
  const data = will.aboutYou

  function update(updates: Partial<typeof data>) {
    dispatch({ type: 'UPDATE_ABOUT_YOU', payload: updates })
  }

  function handleContinue() {
    if (subStep < SUB_STEPS.length - 1) {
      setSubStep(s => s + 1)
    } else {
      dispatch({ type: 'COMPLETE_STEP', payload: 1 })
      router.push('/will/your-family')
    }
  }

  function handleBack() {
    if (subStep > 0) setSubStep(s => s - 1)
    else router.push('/')
  }

  const isCurrentValid = () => {
    if (subStep === 0) return data.legalFirstName.trim() && data.legalLastName.trim()
    if (subStep === 1) return !!data.dateOfBirth
    if (subStep === 2) return data.province && data.city.trim()
    return true
  }

  return (
    <div className="fade-in">
      <AIFlagBanner />
      <StepHeader
        section={t.aboutYou}
        title={
          subStep === 0 ? t.legalName :
          subStep === 1 ? t.dateOfBirth :
          subStep === 2 ? `${t.province} & ${t.city}` :
          t.about_contactInfo
        }
        description={
          subStep === 0 ? t.about_legalNameDesc :
          subStep === 1 ? t.about_dobDesc :
          subStep === 2 ? t.about_locationDesc :
          t.about_contactDesc
        }
        step={subStep}
        totalSteps={SUB_STEPS.length}
      />

      {subStep === 0 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">{t.legalFirstName}</Label>
            <Input
              id="firstName"
              value={data.legalFirstName}
              onChange={e => update({ legalFirstName: e.target.value })}
              placeholder={t.about_firstNamePlaceholder}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">{t.legalLastName}</Label>
            <Input
              id="lastName"
              value={data.legalLastName}
              onChange={e => update({ legalLastName: e.target.value })}
              placeholder={t.about_lastNamePlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preferred">{t.preferredName}</Label>
            <Input
              id="preferred"
              value={data.preferredName ?? ''}
              onChange={e => update({ preferredName: e.target.value })}
              placeholder={t.about_preferredNamePlaceholder}
            />
          </div>
        </div>
      )}

      {subStep === 1 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.dateOfBirth}</Label>
            <DatePicker
              value={data.dateOfBirth}
              onChange={v => update({ dateOfBirth: v })}
              maxYear={new Date().getFullYear() - 18}
              minYear={1920}
            />
          </div>
          {data.dateOfBirth && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              ✓ {t.about_ageConfirmNote}
            </p>
          )}
        </div>
      )}

      {subStep === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.province}</Label>
            <Select value={data.province} onValueChange={v => update({ province: v as typeof data.province })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVINCES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {data.province !== 'ON' && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mt-1">
                ⚠️ {t.about_nonOntarioWarning}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">{t.city}</Label>
            <Input
              id="city"
              value={data.city}
              onChange={e => update({ city: e.target.value })}
              placeholder={t.about_cityPlaceholder}
            />
          </div>
        </div>
      )}

      {subStep === 3 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t.email}</Label>
            <Input
              id="email"
              type="email"
              value={data.email ?? ''}
              onChange={e => update({ email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t.phone}</Label>
            <Input
              id="phone"
              type="tel"
              value={data.phone ?? ''}
              onChange={e => update({ phone: e.target.value })}
              placeholder="+1 (416) 555-0000"
            />
          </div>
        </div>
      )}

      <StepNavigation
        onBack={handleBack}
        onContinue={handleContinue}
        continueDisabled={!isCurrentValid()}
        showSkip={subStep === 3}
        onSkip={() => { dispatch({ type: 'COMPLETE_STEP', payload: 1 }); router.push('/will/your-family') }}
      />
    </div>
  )
}
