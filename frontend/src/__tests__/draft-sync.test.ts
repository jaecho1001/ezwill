import { describe, expect, it } from 'vitest'
import { buildDraftSyncSnapshot, extractPeople } from '@/hooks/use-draft-sync'
import { INITIAL_WILL, type WillDocument } from '@/lib/types/will'

function cloneInitialWill(): WillDocument {
  return JSON.parse(JSON.stringify(INITIAL_WILL)) as WillDocument
}

describe('buildDraftSyncSnapshot', () => {
  it('includes the personal-care backup attorney with a persisted role', () => {
    const will = cloneInitialWill()
    will.poaPersonalCare.backupAttorney = {
      id: 'backup-care', role: 'attorney_care', firstName: 'Alex', lastName: 'Kim',
    }

    expect(extractPeople(will)).toContainEqual(expect.objectContaining({
      id: 'backup-care', role: 'backup_attorney', firstName: 'Alex',
    }))
  })
  it('changes when answer fields change', () => {
    const before = cloneInitialWill()
    const after = cloneInitialWill()

    after.aboutYou.legalFirstName = 'Jane'

    expect(buildDraftSyncSnapshot(after)).not.toEqual(buildDraftSyncSnapshot(before))
  })

  it('changes when assets or liabilities change', () => {
    const before = cloneInitialWill()
    const after = cloneInitialWill()

    after.assets.push({
      id: 'asset-1',
      assetType: 'bank',
      description: 'Savings account',
      estimatedValue: 10000,
    })
    after.liabilities.push({
      id: 'liability-1',
      liabilityType: 'credit_card',
      description: 'Visa',
      outstandingBalance: 1200,
    })

    expect(buildDraftSyncSnapshot(after)).not.toEqual(buildDraftSyncSnapshot(before))
  })

  it('changes when progress metadata changes', () => {
    const before = cloneInitialWill()
    const after = cloneInitialWill()

    after.currentStep = 2
    after.completedSteps = [0, 1]

    expect(buildDraftSyncSnapshot(after)).not.toEqual(buildDraftSyncSnapshot(before))
  })

  it('changes when family/estate/arrangements/POA section fields change', () => {
    const family = cloneInitialWill()
    family.yourFamily.maritalStatus = 'married'
    expect(buildDraftSyncSnapshot(family)).not.toEqual(buildDraftSyncSnapshot(cloneInitialWill()))

    const estate = cloneInitialWill()
    estate.yourEstate.residueDistribution = 'equal_children'
    expect(buildDraftSyncSnapshot(estate)).not.toEqual(buildDraftSyncSnapshot(cloneInitialWill()))

    const arrangements = cloneInitialWill()
    arrangements.yourArrangements.restingPlace = 'burial'
    expect(buildDraftSyncSnapshot(arrangements)).not.toEqual(buildDraftSyncSnapshot(cloneInitialWill()))

    const poaProp = cloneInitialWill()
    poaProp.poaProperty.hasAttorney = true
    expect(buildDraftSyncSnapshot(poaProp)).not.toEqual(buildDraftSyncSnapshot(cloneInitialWill()))

    const poaCare = cloneInitialWill()
    poaCare.poaPersonalCare.hasAttorney = true
    expect(buildDraftSyncSnapshot(poaCare)).not.toEqual(buildDraftSyncSnapshot(cloneInitialWill()))
  })

  it('changes when aiFlags change', () => {
    const before = cloneInitialWill()
    const after = cloneInitialWill()

    after.aiFlags.push({
      id: 'flag-1',
      severity: 'warning',
      title: 'Minor beneficiary without a trust',
      description: 'Consider a trust for the minor child.',
      dismissed: false,
    })

    expect(buildDraftSyncSnapshot(after)).not.toEqual(buildDraftSyncSnapshot(before))
  })

  it('changes when language changes', () => {
    const before = cloneInitialWill()
    const after = cloneInitialWill()

    after.language = 'ko'

    expect(buildDraftSyncSnapshot(after)).not.toEqual(buildDraftSyncSnapshot(before))
  })

  it('does not change for an untracked field (guards against needless syncs)', () => {
    const before = cloneInitialWill()
    const after = cloneInitialWill()

    // currentSubStep is intentionally NOT persisted, so it must not perturb the
    // fingerprint — otherwise autosave would fire on every sub-step navigation.
    after.currentSubStep = 3

    expect(buildDraftSyncSnapshot(after)).toEqual(buildDraftSyncSnapshot(before))
  })
})
