import { describe, expect, it } from 'vitest'
import { emptyVault, normalizeVault, type WillVault } from '@/types/will-vault'
import {
  intakeErrors,
  questionError,
  shouldAsk,
  willIntakeChapters,
} from '@/lib/intake/will-intake-script'
import { vaultToVariables } from '@/lib/will-documents/vault-to-variables'
import { projectVaultForServer } from '@/lib/api/drafts'
import { getVaultReviewFlags } from '@/lib/intake/vault-review-flags'

function vault(patch: Partial<WillVault> = {}): WillVault {
  return normalizeVault({ ...emptyVault, ...patch })
}

describe('unified intake', () => {
  it('has the nine lawyer-reviewed sections in order', () => {
    expect(willIntakeChapters.map((chapter) => chapter.id)).toEqual([
      'testator', 'family', 'executors', 'beneficiaries', 'gifts',
      'trusts', 'assets', 'poa', 'final',
    ])
  })

  it('upgrades a legacy six-section vault without losing answers', () => {
    const migrated = normalizeVault({
      testator: { fullName: 'Jane Doe' },
      goals: { hasPoaProperty: true },
    } as Partial<WillVault>)

    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.testator.fullName).toBe('Jane Doe')
    expect(migrated.poa.property.requested).toBe(true)
    expect(migrated.gifts).toEqual([])
    expect(migrated.assets.items).toEqual([])
  })

  it('asks POA appointment details only when that POA is requested', () => {
    const chapter = willIntakeChapters.find((item) => item.id === 'poa')!
    const attorneys = chapter.questions.find((item) => item.id === 'poa-property-attorneys')!

    expect(shouldAsk(attorneys, vault())).toBe(false)
    expect(shouldAsk(attorneys, vault({
      poa: {
        property: { requested: true, attorneys: [] },
        personalCare: { attorneys: [] },
      },
    }))).toBe(true)
  })

  it('blocks percentage allocations that do not total 100', () => {
    const question = willIntakeChapters
      .find((item) => item.id === 'beneficiaries')!
      .questions.find((item) => item.id === 'beneficiaries')!
    const state = vault({
      residueDistribution: 'percentages',
      beneficiaries: [
        { id: 'a', fullName: 'Alex Kim', sharePercent: 60 },
        { id: 'b', fullName: 'Sam Kim', sharePercent: 30 },
      ],
    })

    expect(questionError(question, state)).toContain('90%')
    state.beneficiaries[1].sharePercent = 40
    expect(questionError(question, state)).toBeNull()
  })

  it('reports required facts before client submission', () => {
    const errors = intakeErrors(vault())
    expect(errors.some((error) => error.questionId === 'testator-name')).toBe(true)
    expect(errors.some((error) => error.questionId === 'poa-property')).toBe(true)
  })

  it('maps client-supplied gift and POA facts into document variables', () => {
    const variables = vaultToVariables(vault({
      beneficiaries: [{ id: 'b', fullName: 'Alex Kim' }],
      gifts: [{
        id: 'g', type: 'charity', description: 'A legacy gift',
        charityName: 'Ontario Charity', charityNumber: '12345', amount: 5000,
      }],
      poa: {
        property: { requested: true, attorneys: [{ id: 'p', fullName: 'Pat Lee' }] },
        personalCare: { requested: true, attorneys: [{ id: 'c', fullName: 'Chris Lee' }] },
      },
    }))

    expect(variables).toMatchObject({
      recipientFullName: 'Alex Kim',
      charityName: 'Ontario Charity',
      charityNumber: '12345',
      poaPropertyAttorneyFullName: 'Pat Lee',
      poaCareAttorneyFullName: 'Chris Lee',
    })
  })

  it('projects the canonical vault into the lawyer dashboard tables', () => {
    const projection = projectVaultForServer(vault({
      executors: [{ id: 'e', fullName: 'Alex Kim' }],
      assets: {
        items: [{ id: 'a', type: 'foreign', description: 'Apartment outside Canada' }],
        liabilities: [{ id: 'l', type: 'mortgage', description: 'Home mortgage', estimatedBalance: 100000 }],
      },
    }))

    expect(projection.people).toContainEqual(expect.objectContaining({
      role: 'executor', firstName: 'Alex', lastName: 'Kim',
    }))
    expect(projection.assets[0]).toMatchObject({
      assetType: 'personal_property', description: 'Apartment outside Canada',
    })
    expect(projection.liabilities[0]).toMatchObject({
      liability_type: 'mortgage', outstanding_balance: 100000,
    })
  })

  it('turns complex facts into lawyer-review flags without choosing a strategy', () => {
    const flags = getVaultReviewFlags(vault({
      spouse: { included: true, fullName: 'Alex Kim', separated: true },
      assets: { items: [], liabilities: [], privateCompanyShares: true },
      goals: { dualWillReviewRequested: true },
    }))

    expect(flags.map((flag) => flag.id)).toEqual(expect.arrayContaining([
      'vault-separated', 'vault-dual-will',
    ]))
    expect(flags.find((flag) => flag.id === 'vault-dual-will')?.description).toContain('before deciding')
  })
})
