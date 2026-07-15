import { describe, expect, it } from 'vitest'
import { householdPersonSuggestions, personToRoleUpdates } from '@/lib/person-suggestions'
import { INITIAL_WILL, type PersonData, type WillDocument } from '@/lib/types/will'

function cloneWill(): WillDocument {
  return JSON.parse(JSON.stringify(INITIAL_WILL)) as WillDocument
}

describe('person suggestions', () => {
  it('offers spouse and children as beneficiary suggestions', () => {
    const will = cloneWill()
    will.yourFamily.hasSpouse = true
    will.yourFamily.spouse = {
      id: 'spouse-1',
      role: 'spouse',
      firstName: 'Jane',
      lastName: 'Cho',
      email: 'jane@example.com',
      phone: '+14165550111',
    }
    will.yourFamily.hasChildren = true
    will.yourFamily.children = [
      {
        id: 'child-1',
        role: 'child',
        firstName: 'Min',
        lastName: 'Cho',
        isMinor: true,
        receivesODSP: true,
      },
    ]

    const suggestions = householdPersonSuggestions(will, 'beneficiary')

    expect(suggestions).toHaveLength(2)
    expect(suggestions[0]).toMatchObject({
      label: 'Jane Cho',
      source: 'spouse',
      updates: {
        role: 'beneficiary',
        firstName: 'Jane',
        lastName: 'Cho',
        relationship: 'Spouse',
        email: 'jane@example.com',
        phone: '+14165550111',
      },
    })
    expect(suggestions[0].updates.id).toBeUndefined()
    expect(suggestions[1].updates).toMatchObject({
      role: 'beneficiary',
      firstName: 'Min',
      lastName: 'Cho',
      relationship: 'Child',
      isMinor: true,
      receivesODSP: true,
    })
  })

  it('keeps copied role data separate from the source person id', () => {
    const source: PersonData = {
      id: 'source-spouse',
      role: 'spouse',
      firstName: 'Alex',
      lastName: 'Kim',
      relationship: 'Partner',
      email: 'alex@example.com',
      phone: '+14165550123',
    }

    const updates = personToRoleUpdates(source, 'executor', 'spouse')

    expect(updates).toEqual({
      role: 'executor',
      firstName: 'Alex',
      lastName: 'Kim',
      relationship: 'Partner',
      email: 'alex@example.com',
      phone: '+14165550123',
    })
    expect(updates.id).toBeUndefined()
  })

  it('does not suggest blank household records', () => {
    const will = cloneWill()
    will.yourFamily.hasSpouse = true
    will.yourFamily.spouse = { id: 'blank-spouse', role: 'spouse', firstName: '', lastName: '' }
    will.yourFamily.hasChildren = true
    will.yourFamily.children = [
      { id: 'blank-child', role: 'child', firstName: '', lastName: '' },
    ]

    expect(householdPersonSuggestions(will, 'executor')).toEqual([])
  })

  it('excludes household people already selected for the same group', () => {
    const will = cloneWill()
    will.yourFamily.hasSpouse = true
    will.yourFamily.spouse = { id: 'spouse', role: 'spouse', firstName: 'Jane', lastName: 'Cho' }
    will.yourFamily.hasChildren = true
    will.yourFamily.children = [{ id: 'child', role: 'child', firstName: 'Min', lastName: 'Cho' }]

    const suggestions = householdPersonSuggestions(will, 'executor', [
      { firstName: 'jane', lastName: 'CHO' },
    ])

    expect(suggestions.map(suggestion => suggestion.label)).toEqual(['Min Cho'])
  })
})
