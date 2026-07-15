'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/providers/i18n-provider'
import type { PersonData } from '@/lib/types/will'
import type { PersonSuggestion } from '@/lib/person-suggestions'

interface PersonFormProps {
  value: Partial<PersonData>
  onChange: (updates: Partial<PersonData>) => void
  showRelationship?: boolean
  showEmail?: boolean
  showPhone?: boolean
  showAddress?: boolean
  title?: string
  suggestions?: PersonSuggestion[]
}

export function PersonForm({ value, onChange, showRelationship, showEmail, showPhone, showAddress, title, suggestions = [] }: PersonFormProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      {title && <p className="font-medium text-sm text-gray-700">{title}</p>}
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-[#E8E4DF] bg-[#FAF8F5] p-3">
          <p className="mb-2 text-xs font-medium uppercase text-[#2D2D2D]/50">
            {t.useExistingPerson}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(suggestion => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => onChange(suggestion.updates)}
                className="rounded-full border border-[#1B2A4A]/20 bg-white px-3 py-1.5 text-xs font-medium text-[#1B2A4A] transition-colors hover:border-[#1B2A4A]/40 hover:bg-[#1B2A4A]/5"
              >
                {t.usePersonSuggestion} {suggestion.label}
                <span className="ml-1 text-[#2D2D2D]/45">
                  ({suggestion.source === 'spouse' ? t.review_spouse : t.family_child})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t.firstName}</Label>
          <Input value={value.firstName ?? ''} onChange={e => onChange({ firstName: e.target.value })} placeholder="First name" />
        </div>
        <div className="space-y-1.5">
          <Label>{t.lastName}</Label>
          <Input value={value.lastName ?? ''} onChange={e => onChange({ lastName: e.target.value })} placeholder="Last name" />
        </div>
      </div>
      {showRelationship && (
        <div className="space-y-1.5">
          <Label>{t.relationship}</Label>
          <Input value={value.relationship ?? ''} onChange={e => onChange({ relationship: e.target.value })} placeholder="e.g. Sister, Friend, Business partner" />
        </div>
      )}
      {showEmail && (
        <div className="space-y-1.5">
          <Label>{t.emailAddress}</Label>
          <Input type="email" value={value.email ?? ''} onChange={e => onChange({ email: e.target.value })} placeholder="email@example.com" />
        </div>
      )}
      {showPhone && (
        <div className="space-y-1.5">
          <Label>{t.phoneNumber}</Label>
          <Input type="tel" value={value.phone ?? ''} onChange={e => onChange({ phone: e.target.value })} placeholder="+1 (416) 555-0000" />
        </div>
      )}
      {showAddress && (
        <div className="space-y-1.5">
          <Label>{t.address}</Label>
          <Input value={value.address ?? ''} onChange={e => onChange({ address: e.target.value })} placeholder="Full address" />
        </div>
      )}
    </div>
  )
}
