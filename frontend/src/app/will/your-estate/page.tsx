'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StepHeader } from '@/components/will/step-header'
import { StepNavigation } from '@/components/will/step-navigation'
import { AIFlagBanner } from '@/components/will/ai-flag-banner'
import { PersonForm } from '@/components/will/person-form'
import { PercentageAllocator } from '@/components/will/percentage-allocator'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import type { PersonData } from '@/lib/types/will'

function newPerson(role: PersonData['role']): PersonData {
  return { id: crypto.randomUUID(), role, firstName: '', lastName: '', percentage: 0 }
}

export default function YourEstatePage() {
  const router = useRouter()
  const { will, dispatch } = useWillForm()
  const { t } = useTranslation()
  const [subStep, setSubStep] = useState(0)
  const data = will.yourEstate

  function update(updates: Partial<typeof data>) {
    dispatch({ type: 'UPDATE_ESTATE', payload: updates })
  }

  const SUB_STEPS = ['specific-gifts', 'donations', 'beneficiaries', 'distribution', 'minor-trust', 'ontario-clauses']
  const totalSubs = SUB_STEPS.length

  function handleContinue() {
    if (subStep < totalSubs - 1) setSubStep(s => s + 1)
    else {
      dispatch({ type: 'COMPLETE_STEP', payload: 3 })
      router.push('/will/your-arrangements')
    }
  }

  return (
    <div className="fade-in">
      <AIFlagBanner />
      <StepHeader
        section={t.yourEstate}
        title={
          subStep === 0 ? t.specificGifts :
          subStep === 1 ? t.charityDonations :
          subStep === 2 ? t.beneficiaries :
          subStep === 3 ? t.distribution :
          subStep === 4 ? t.minorTrustAge :
          t.ontarioProtections
        }
        step={subStep}
        totalSteps={totalSubs}
      />

      {subStep === 0 && (
        <div className="space-y-6">
          <RadioGroup
            name="hasGifts"
            columns={2}
            value={data.hasSpecificGifts ? 'yes' : 'no'}
            onChange={v => update({ hasSpecificGifts: v === 'yes' })}
            options={[
              { value: 'yes', title: 'Yes, I have specific items', icon: '🎁' },
              { value: 'no', title: 'No specific gifts', icon: '✗', description: 'Everything goes to beneficiaries' },
            ]}
          />
          {data.hasSpecificGifts && (
            <div className="space-y-3">
              {data.gifts.map((gift, i) => (
                <div key={gift.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium text-gray-700">Gift {i + 1}</p>
                    <button onClick={() => update({ gifts: data.gifts.filter(g => g.id !== gift.id) })} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="space-y-2">
                    <Input value={gift.description} onChange={e => update({ gifts: data.gifts.map(g => g.id === gift.id ? { ...g, description: e.target.value } : g) })} placeholder="Describe the item (e.g. my wedding ring, 1967 Mustang)" />
                    <Input value={gift.recipientId ?? ''} onChange={e => update({ gifts: data.gifts.map(g => g.id === gift.id ? { ...g, recipientId: e.target.value } : g) })} placeholder="Recipient's full name" />
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full gap-2" onClick={() => update({ gifts: [...data.gifts, { id: crypto.randomUUID(), type: 'specific_item', description: '', recipientId: '' }] })}>
                <Plus className="h-4 w-4" /> Add a Gift
              </Button>
            </div>
          )}
        </div>
      )}

      {subStep === 1 && (
        <div className="space-y-6">
          <RadioGroup
            name="hasDonations"
            columns={2}
            value={data.hasDonations ? 'yes' : 'no'}
            onChange={v => update({ hasDonations: v === 'yes' })}
            options={[
              { value: 'yes', title: 'Yes, I want to donate', icon: '🏥' },
              { value: 'no', title: 'No donations', icon: '✗' },
            ]}
          />
          {data.hasDonations && (
            <div className="space-y-3">
              {data.donations.map((d, i) => (
                <div key={d.id} className="border border-gray-200 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between">
                    <p className="text-sm font-medium">Charity {i + 1}</p>
                    <button onClick={() => update({ donations: data.donations.filter(x => x.id !== d.id) })} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <Input value={d.charityName ?? ''} onChange={e => update({ donations: data.donations.map(x => x.id === d.id ? { ...x, charityName: e.target.value } : x) })} placeholder="Charity name" />
                  <Input value={d.charityNumber ?? ''} onChange={e => update({ donations: data.donations.map(x => x.id === d.id ? { ...x, charityNumber: e.target.value } : x) })} placeholder="CRA charity number (optional)" />
                  <Input value={d.description} onChange={e => update({ donations: data.donations.map(x => x.id === d.id ? { ...x, description: e.target.value } : x) })} placeholder="Amount or percentage (e.g. $10,000 or 5%)" />
                  <p className="text-xs text-gray-400">Cy-près note: If this charity no longer exists, the Court may redirect the gift to a similar cause.</p>
                </div>
              ))}
              <Button variant="outline" className="w-full gap-2" onClick={() => update({ donations: [...data.donations, { id: crypto.randomUUID(), type: 'charity', description: '' }] })}>
                <Plus className="h-4 w-4" /> Add Charity
              </Button>
            </div>
          )}
        </div>
      )}

      {subStep === 2 && (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">Who receives the remainder of your estate (after specific gifts)?</p>
          {data.beneficiaries.map((b, i) => (
            <div key={b.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium">Beneficiary {i + 1}</p>
                <button onClick={() => update({ beneficiaries: data.beneficiaries.filter(x => x.id !== b.id) })} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
              <PersonForm value={b} onChange={updates => update({ beneficiaries: data.beneficiaries.map(x => x.id === b.id ? { ...x, ...updates } : x) })} showRelationship />
              <div className="flex gap-3">
                <Checkbox id={`odsp-b-${b.id}`} checked={!!b.receivesODSP} onChange={e => update({ beneficiaries: data.beneficiaries.map(x => x.id === b.id ? { ...x, receivesODSP: (e.target as HTMLInputElement).checked } : x) })} label="Receives ODSP" />
                <Checkbox id={`us-b-${b.id}`} checked={!!b.isUSPerson} onChange={e => update({ beneficiaries: data.beneficiaries.map(x => x.id === b.id ? { ...x, isUSPerson: (e.target as HTMLInputElement).checked } : x) })} label="US person" />
              </div>
            </div>
          ))}
          <Button variant="outline" className="w-full gap-2" onClick={() => update({ beneficiaries: [...data.beneficiaries, newPerson('beneficiary')] })}>
            <Plus className="h-4 w-4" /> Add Beneficiary
          </Button>
        </div>
      )}

      {subStep === 3 && (
        <div className="space-y-6">
          <RadioGroup
            name="distribution"
            columns={1}
            value={data.residueDistribution}
            onChange={v => update({ residueDistribution: v as typeof data.residueDistribution })}
            options={[
              { value: 'per_stirpes', title: 'Per Stirpes (Recommended)', description: 'If a beneficiary predeceases you, their share passes to their children automatically. Includes unborn beneficiaries (Saunders v. Vautier protection).' },
              { value: 'equal_children', title: 'Equally to my children', description: 'Split equally among surviving children only.' },
              { value: 'equal_beneficiaries', title: 'Equally to all beneficiaries', description: 'Split equally among all listed beneficiaries.' },
              { value: 'custom', title: 'Custom percentages', description: 'I will specify exact percentages.' },
            ]}
          />
          {data.residueDistribution === 'custom' && data.beneficiaries.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Allocate percentages (must total 100%)</p>
              <PercentageAllocator people={data.beneficiaries} onChange={updated => update({ beneficiaries: updated })} />
            </div>
          )}
        </div>
      )}

      {subStep === 4 && (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">Ontario default is age 18. Most estate lawyers recommend age 25 to protect young beneficiaries.</p>
          <div className="space-y-1.5">
            <Label>Trust Distribution Age</Label>
            <Select value={data.minorTrustAge.toString()} onValueChange={v => update({ minorTrustAge: parseInt(v) })}>
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[18, 19, 21, 23, 25, 30, 35].map(age => (
                  <SelectItem key={age} value={age.toString()}>Age {age}{age === 25 ? ' (Recommended)' : age === 18 ? ' (Ontario default)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-800 mb-1">How this works:</p>
            <p>Until your beneficiary reaches age {data.minorTrustAge}, your executor holds the inheritance in trust and can use it for their health, education, maintenance, and advancement. At age {data.minorTrustAge}, they receive the remainder outright.</p>
          </div>
        </div>
      )}

      {subStep === 5 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">These Ontario-specific clauses provide important legal protections. All are recommended for Ontario Wills.</p>
          <div className="space-y-3">
            <div className={`rounded-xl border-2 p-4 ${data.includeFLAExclusion ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="fla"
                  checked={data.includeFLAExclusion}
                  onChange={e => update({ includeFLAExclusion: (e.target as HTMLInputElement).checked })}
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">FLA Exclusion Clause <span className="text-xs text-red-500 font-normal ml-1">Critical — Ontario</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">Protects your inheritance from being split in a divorce. Required by Family Law Act s.4(2)(2). Should be included in every Ontario Will.</p>
                </div>
              </div>
            </div>
            <div className={`rounded-xl border-2 p-4 ${data.includeGREClause ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="gre"
                  checked={data.includeGREClause}
                  onChange={e => update({ includeGREClause: (e.target as HTMLInputElement).checked })}
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">GRE Maintenance Clause</p>
                  <p className="text-xs text-gray-500 mt-0.5">Graduated Rate Estate status for 36 months — saves significant income tax. Anti-tainting provisions prevent loss of GRE status (ITA s.248).</p>
                </div>
              </div>
            </div>
            <div className={`rounded-xl border-2 p-4 ${data.includeDualWill ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="dual"
                  checked={data.includeDualWill}
                  onChange={e => update({ includeDualWill: (e.target as HTMLInputElement).checked })}
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Dual Will Strategy</p>
                  <p className="text-xs text-gray-500 mt-0.5">Primary Will + Private Will for business interests. Keeps private company shares out of probate — saves ~1.5% Estate Administration Tax. (Granovsky Estate; Re Milne Estate 2019)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <StepNavigation
        onBack={() => subStep > 0 ? setSubStep(s => s - 1) : router.push('/will/your-family')}
        onContinue={handleContinue}
        showSkip={subStep === 0 || subStep === 1}
        onSkip={() => setSubStep(s => s + 1)}
      />
    </div>
  )
}
