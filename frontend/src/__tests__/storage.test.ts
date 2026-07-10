import { describe, expect, it } from 'vitest'
import { migrateDraft } from '@/lib/storage'

describe('draft migration', () => {
  it('fills sections and fields missing from an older partial draft', () => {
    const migrated = migrateDraft({
      id: 'old',
      aboutYou: { legalFirstName: 'Jane' },
      yourFamily: { hasSpouse: true, spouse: { firstName: 'Alex', lastName: 'Kim' } },
    })

    expect(migrated).not.toBeNull()
    expect(migrated?.aboutYou).toMatchObject({ legalFirstName: 'Jane', province: 'ON', city: '' })
    expect(migrated?.yourFamily.spouse).toMatchObject({ firstName: 'Alex', lastName: 'Kim' })
    expect(migrated?.yourEstate.beneficiaries).toEqual([])
    expect(migrated?.poaPersonalCare.hasAttorney).toBe(false)
  })

  it('replaces incompatible known values with schema defaults', () => {
    const migrated = migrateDraft({
      currentStep: 'later',
      completedSteps: {},
      aboutYou: null,
      yourFamily: { children: 'invalid' },
    })

    expect(migrated?.currentStep).toBe(0)
    expect(migrated?.completedSteps).toEqual([])
    expect(migrated?.aboutYou.province).toBe('ON')
    expect(migrated?.yourFamily.children).toEqual([])
  })

  it('rejects non-object persisted values', () => {
    expect(migrateDraft(null)).toBeNull()
    expect(migrateDraft([])).toBeNull()
    expect(migrateDraft('draft')).toBeNull()
  })
})
