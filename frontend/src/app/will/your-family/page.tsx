'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { StepHeader } from '@/components/will/step-header'
import { StepNavigation } from '@/components/will/step-navigation'
import { AIFlagBanner } from '@/components/will/ai-flag-banner'
import { PersonForm } from '@/components/will/person-form'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import type { PersonData, MaritalStatus } from '@/lib/types/will'

function newPerson(role: PersonData['role']): PersonData {
  return { id: crypto.randomUUID(), role, firstName: '', lastName: '' }
}

export default function YourFamilyPage() {
  const router = useRouter()
  const { will, dispatch } = useWillForm()
  const { t } = useTranslation()
  const [subStep, setSubStep] = useState(0)
  const data = will.yourFamily

  function update(updates: Partial<typeof data>) {
    dispatch({ type: 'UPDATE_FAMILY', payload: updates })
  }

  const subSteps = [
    'marital-status',
    ...(data.hasSpouse ? ['spouse'] : []),
    'children',
    ...(data.hasChildren ? ['guardians'] : []),
    'pets',
  ]
  const totalSubs = subSteps.length

  function handleContinue() {
    if (subStep < totalSubs - 1) setSubStep(s => s + 1)
    else {
      dispatch({ type: 'COMPLETE_STEP', payload: 2 })
      router.push('/will/your-estate')
    }
  }

  function handleBack() {
    if (subStep > 0) setSubStep(s => s - 1)
    else router.push('/will/about-you')
  }

  const currentKey = subSteps[subStep]

  return (
    <div className="fade-in">
      <AIFlagBanner />
      <StepHeader
        section={t.yourFamily}
        title={
          currentKey === 'marital-status' ? t.maritalStatus :
          currentKey === 'spouse' ? t.doYouHaveSpouse :
          currentKey === 'children' ? t.doYouHaveChildren :
          currentKey === 'guardians' ? t.doYouHaveGuardians :
          t.doYouHavePets
        }
        step={subStep}
        totalSteps={totalSubs}
      />

      {currentKey === 'marital-status' && (
        <div className="space-y-6">
          <RadioGroup
            name="maritalStatus"
            columns={2}
            value={data.maritalStatus}
            onChange={(v) => {
              const ms = v as MaritalStatus
              update({
                maritalStatus: ms,
                hasSpouse: ms === 'married' || ms === 'commonlaw',
              })
            }}
            options={[
              { value: 'single', title: t.maritalStatuses.single, icon: '🧑' },
              { value: 'married', title: t.maritalStatuses.married, icon: '💍' },
              { value: 'commonlaw', title: t.maritalStatuses.commonlaw, icon: '🤝', description: t.family_commonlawDesc },
              { value: 'separated', title: t.maritalStatuses.separated, icon: '↔️', description: t.family_separatedDesc },
              { value: 'divorced', title: t.maritalStatuses.divorced, icon: '📋' },
              { value: 'widowed', title: t.maritalStatuses.widowed, icon: '🕊️' },
            ]}
          />
          {data.maritalStatus === 'separated' && (
            <div className="space-y-1.5">
              <Label>{t.family_separationDate}</Label>
              <input
                type="date"
                value={data.separationDate ?? ''}
                onChange={e => update({ separationDate: e.target.value })}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2A4A]/25 focus-visible:border-[#1B2A4A]"
              />
              <p className="text-xs text-[#8a6a1e]">{t.family_separationNote}</p>
            </div>
          )}
        </div>
      )}

      {currentKey === 'spouse' && (
        <div className="space-y-6">
          <PersonForm
            value={data.spouse ?? {}}
            onChange={updates => update({ spouse: { ...newPerson('spouse'), ...data.spouse, ...updates } })}
            showEmail
            showPhone
          />
        </div>
      )}

      {currentKey === 'children' && (
        <div className="space-y-6">
          <RadioGroup
            name="hasChildren"
            columns={2}
            value={data.hasChildren ? 'yes' : 'no'}
            onChange={v => update({ hasChildren: v === 'yes', children: v === 'no' ? [] : data.children })}
            options={[
              { value: 'yes', title: t.yes, icon: '👶' },
              { value: 'no', title: t.no, icon: '✗' },
            ]}
          />
          {data.hasChildren && (
            <div className="space-y-4">
              {data.children.map((child, i) => (
                <div key={child.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">{t.family_child} {i + 1}</p>
                    <button onClick={() => update({ children: data.children.filter(c => c.id !== child.id) })} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <PersonForm
                    value={child}
                    onChange={updates => update({ children: data.children.map(c => c.id === child.id ? { ...c, ...updates } : c) })}
                  />
                  <div className="flex items-center gap-4 pt-1">
                    <Checkbox
                      id={`minor-${child.id}`}
                      checked={!!child.isMinor}
                      onChange={e => update({ children: data.children.map(c => c.id === child.id ? { ...c, isMinor: (e.target as HTMLInputElement).checked } : c) })}
                      label={t.family_minorLabel}
                    />
                    <Checkbox
                      id={`odsp-${child.id}`}
                      checked={!!child.receivesODSP}
                      onChange={e => update({ children: data.children.map(c => c.id === child.id ? { ...c, receivesODSP: (e.target as HTMLInputElement).checked } : c) })}
                      label={t.family_odspLabel}
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => update({ children: [...data.children, newPerson('child')] })}
              >
                <Plus className="h-4 w-4" /> {t.addChild}
              </Button>
            </div>
          )}
        </div>
      )}

      {currentKey === 'guardians' && (
        <div className="space-y-4">
          <p className="text-sm text-[#8a6a1e] bg-[#C9A84C]/10 border border-[#C9A84C]/40 rounded-lg p-3">
            <strong>{t.family_guardianLawTitle}</strong> {t.family_guardianLawNote}
          </p>
          {data.guardians.map((g, i) => (
            <div key={g.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">{t.family_guardian} {i + 1}{i === 0 ? ` ${t.family_primary}` : ` ${t.family_backup}`}</p>
                <button onClick={() => update({ guardians: data.guardians.filter(x => x.id !== g.id) })} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <PersonForm value={g} onChange={updates => update({ guardians: data.guardians.map(x => x.id === g.id ? { ...x, ...updates } : x) })} showRelationship showEmail />
            </div>
          ))}
          <Button variant="outline" className="w-full gap-2" onClick={() => update({ guardians: [...data.guardians, newPerson('guardian')] })}>
            <Plus className="h-4 w-4" /> {t.addGuardian}
          </Button>
        </div>
      )}

      {currentKey === 'pets' && (
        <div className="space-y-6">
          <RadioGroup
            name="hasPets"
            columns={2}
            value={data.hasPets ? 'yes' : 'no'}
            onChange={v => update({ hasPets: v === 'yes', pets: v === 'no' ? [] : data.pets })}
            options={[
              { value: 'yes', title: t.yes, icon: '🐾' },
              { value: 'no', title: t.no, icon: '✗' },
            ]}
          />
          {data.hasPets && (
            <div className="space-y-4">
              {data.pets.map((pet, i) => (
                <div key={pet.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">{t.family_pet} {i + 1}</p>
                    <button onClick={() => update({ pets: data.pets.filter(p => p.id !== pet.id) })} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1"><Label>{t.family_petName}</Label><Input value={pet.name} onChange={e => update({ pets: data.pets.map(p => p.id === pet.id ? { ...p, name: e.target.value } : p) })} placeholder={t.family_petNamePlaceholder} /></div>
                    <div className="space-y-1"><Label>{t.family_petType}</Label><Input value={pet.type} onChange={e => update({ pets: data.pets.map(p => p.id === pet.id ? { ...p, type: e.target.value } : p) })} placeholder={t.family_petTypePlaceholder} /></div>
                    <div className="space-y-1 col-span-3"><Label>{t.family_caregiverName}</Label><Input value={pet.caregiverName} onChange={e => update({ pets: data.pets.map(p => p.id === pet.id ? { ...p, caregiverName: e.target.value } : p) })} placeholder={t.family_caregiverPlaceholder} /></div>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full gap-2" onClick={() => update({ pets: [...data.pets, { id: crypto.randomUUID(), name: '', type: '', caregiverName: '' }] })}>
                <Plus className="h-4 w-4" /> {t.addPet}
              </Button>
            </div>
          )}
        </div>
      )}

      <StepNavigation onBack={handleBack} onContinue={handleContinue} />
    </div>
  )
}
