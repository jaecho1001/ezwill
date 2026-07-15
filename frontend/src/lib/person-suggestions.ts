import type { PersonData, PersonRole, WillDocument } from '@/lib/types/will'

export type PersonSuggestionSource = 'spouse' | 'child'

export interface PersonSuggestion {
  id: string
  label: string
  source: PersonSuggestionSource
  updates: Partial<PersonData>
}

function fullName(person: Partial<PersonData>): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ').trim()
}

function relationshipForSource(source: PersonSuggestionSource): string {
  return source === 'spouse' ? 'Spouse' : 'Child'
}

export function personToRoleUpdates(
  person: Partial<PersonData>,
  role: PersonRole,
  source: PersonSuggestionSource
): Partial<PersonData> {
  const updates: Partial<PersonData> = {
    role,
    firstName: person.firstName ?? '',
    lastName: person.lastName ?? '',
    relationship: person.relationship || relationshipForSource(source),
    email: person.email,
    phone: person.phone,
    address: person.address,
    birthDate: person.birthDate,
  }

  if (role === 'beneficiary' || role === 'contingent_beneficiary') {
    updates.isMinor = person.isMinor
    updates.receivesODSP = person.receivesODSP
    updates.isUSPerson = person.isUSPerson
  }

  return Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as Partial<PersonData>
}

export function householdPersonSuggestions(
  will: Pick<WillDocument, 'yourFamily'>,
  role: PersonRole,
  excludedPeople: Array<Partial<PersonData> | null | undefined> = []
): PersonSuggestion[] {
  const suggestions: PersonSuggestion[] = []
  const { yourFamily } = will

  if (yourFamily.hasSpouse && yourFamily.spouse && fullName(yourFamily.spouse)) {
    suggestions.push({
      id: `spouse-${yourFamily.spouse.id || fullName(yourFamily.spouse)}`,
      label: fullName(yourFamily.spouse),
      source: 'spouse',
      updates: personToRoleUpdates(yourFamily.spouse, role, 'spouse'),
    })
  }

  if (yourFamily.hasChildren) {
    for (const child of yourFamily.children) {
      const label = fullName(child)
      if (!label) continue
      suggestions.push({
        id: `child-${child.id || label}`,
        label,
        source: 'child',
        updates: personToRoleUpdates(child, role, 'child'),
      })
    }
  }

  const excludedNames = new Set(excludedPeople.map(person => person ? fullName(person) : '').filter(Boolean).map(name => name.toLocaleLowerCase()))
  return suggestions.filter(suggestion => !excludedNames.has(suggestion.label.toLocaleLowerCase()))
}
