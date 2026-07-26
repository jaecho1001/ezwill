import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyVault, normalizeVault, type WillVault } from '@/types/will-vault'
import {
  intakeErrors,
  questionError,
  shouldAsk,
  willIntakeChapters,
} from '@/lib/intake/will-intake-script'
import { vaultToVariables } from '@/lib/will-documents/vault-to-variables'
import { projectVaultForServer, saveVaultToServer } from '@/lib/api/drafts'
import { getVaultReviewFlags } from '@/lib/intake/vault-review-flags'

function vault(patch: Partial<WillVault> = {}): WillVault {
  return normalizeVault({ ...emptyVault, ...patch })
}

describe('unified intake', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
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

  it('uses the specific gift recipient rather than a residue beneficiary', () => {
    const variables = vaultToVariables(vault({
      beneficiaries: [{ id: 'b', fullName: 'Alex Kim' }],
      gifts: [{
        id: 'g', type: 'personal_item', description: "My mother's ring",
        recipientName: 'Sarah Lee',
      }],
      poa: {
        property: { requested: true, attorneys: [{ id: 'p', fullName: 'Pat Lee' }] },
        personalCare: { requested: true, attorneys: [{ id: 'c', fullName: 'Chris Lee' }] },
      },
    }))

    expect(variables).toMatchObject({
      recipientFullName: 'Sarah Lee',
      poaPropertyAttorneyFullName: 'Pat Lee',
      poaCareAttorneyFullName: 'Chris Lee',
    })
    expect(variables.recipientFullName).not.toBe('Alex Kim')
  })

  it('requires a recipient for each non-charitable specific gift', () => {
    const question = willIntakeChapters
      .find((item) => item.id === 'gifts')!
      .questions.find((item) => item.id === 'gifts')!
    const state = vault({
      gifts: [{ id: 'g', type: 'personal_item', description: "My mother's ring" }],
    })

    expect(questionError(question, state)).toContain('intended recipient')
    state.gifts[0].recipientName = 'Sarah Lee'
    expect(questionError(question, state)).toBeNull()
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

  it('autosave does not send replace-all projections, but explicit submit can', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const state = vault({
      executors: [{ id: 'e', fullName: 'Alex Kim' }],
      assets: { items: [], liabilities: [] },
    })

    await saveVaultToServer('draft-a', state as unknown as Record<string, unknown>, undefined, 'token-a')
    const autosaveBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(autosaveBody).toEqual({ vault: state })
    expect(autosaveBody).not.toHaveProperty('people')
    expect(autosaveBody).not.toHaveProperty('assets')

    await saveVaultToServer(
      'draft-a', state as unknown as Record<string, unknown>,
      { email: 'client@example.com' }, 'token-a', true,
    )
    const submitBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(submitBody.people).toHaveLength(1)
    expect(submitBody.client_email).toBe('client@example.com')
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
