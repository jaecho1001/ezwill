import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyVault, normalizeVault, type WillVault } from '@/types/will-vault'
import {
  chapterProgress,
  intakeErrors,
  overallProgress,
  questionError,
  shouldAsk,
  willIntakeChapters,
  UNNAMED_SHARE_ERROR,
  type IntakeChapter,
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

  it('requires an explicit life-support answer when personal-care POA is requested', () => {
    const chapter = willIntakeChapters.find((item) => item.id === 'poa')!
    const question = chapter.questions.find(
      (item) => item.id === 'poa-care-life-support'
    )!
    const state = vault({
      poa: {
        property: { requested: false, attorneys: [] },
        personalCare: {
          requested: true,
          attorneys: [{ id: 'c', fullName: 'Chris Lee' }],
        },
      },
    })

    expect(shouldAsk(question, state)).toBe(true)
    expect(questionError(question, state)).toBeTruthy()
    state.poa.personalCare.lifeSupport = 'withhold'
    expect(questionError(question, state)).toBeNull()
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

describe('intake progress semantics (issue #79)', () => {
  // A chapter that is skipped entirely until the vault says otherwise —
  // exercises the applicable/not-applicable distinction, which no chapter
  // in the current script triggers at the chapter level.
  const conditionalChapter: IntakeChapter = {
    id: 'synthetic-conditional',
    title: 'Synthetic conditional chapter',
    icon: '0',
    intro: '',
    questions: [{
      id: 'synthetic-spouse-dob', vaultPath: 'spouse.dob',
      prompt: 'Spouse date of birth', kind: 'date', required: true,
      skipIf: (v) => !v.spouse?.included,
    }],
  }

  it('never reports any chapter of an empty vault as complete', () => {
    for (const chapter of willIntakeChapters) {
      const progress = chapterProgress(chapter, vault())
      // Every chapter is either not applicable or genuinely at 0%.
      expect(progress.pct === 0 || !progress.applicable).toBe(true)
      // No chapter may look "completable-100" (the green-tick condition).
      expect(progress.applicable && progress.pct === 100 && progress.requiredUnanswered === 0).toBe(false)
    }
  })

  it('reports a fully skipped chapter as not applicable with pct 0, never 100', () => {
    expect(chapterProgress(conditionalChapter, vault())).toEqual({
      asked: 0, answered: 0, pct: 0, requiredUnanswered: 0, applicable: false,
    })
  })

  it('makes a chapter applicable mid-flow once its skip rules release', () => {
    const state = vault({ spouse: { included: true } })
    const progress = chapterProgress(conditionalChapter, state)
    expect(progress.applicable).toBe(true)
    expect(progress.requiredUnanswered).toBe(1)
    expect(progress.pct).toBe(0)
    state.spouse!.dob = '1980-01-01'
    expect(chapterProgress(conditionalChapter, state).pct).toBe(100)
  })

  it('tracks optional-only chapters by answers given, not as instant 100%', () => {
    const gifts = willIntakeChapters.find((chapter) => chapter.id === 'gifts')!
    expect(chapterProgress(gifts, vault()).pct).toBe(0)
    const withGift = vault({
      gifts: [{ id: 'g', type: 'personal_item', description: 'Watch', recipientName: 'Sarah Lee' }],
    })
    expect(chapterProgress(gifts, withGift).pct).toBe(100)
  })

  it('requires a spouse name for married and common-law clients', () => {
    const spouseName = willIntakeChapters
      .find((chapter) => chapter.id === 'family')!
      .questions.find((question) => question.id === 'spouse-name')!

    for (const maritalStatus of ['married', 'common_law'] as const) {
      const state = vault({ testator: { maritalStatus } })
      expect(shouldAsk(spouseName, state)).toBe(true)
      expect(questionError(spouseName, state)).toBeTruthy()
      const family = chapterProgress(willIntakeChapters.find((c) => c.id === 'family')!, state)
      expect(family.requiredUnanswered).toBeGreaterThan(0)
    }
    // Declining to benefit the spouse does not remove the identity requirement.
    const declined = vault({ testator: { maritalStatus: 'married' }, spouse: { included: false } })
    expect(shouldAsk(spouseName, declined)).toBe(true)
    expect(questionError(spouseName, declined)).toBeTruthy()
    // Naming the spouse satisfies it; single clients are never asked.
    const namedSpouse = vault({ testator: { maritalStatus: 'married' }, spouse: { included: true, fullName: 'Alex Kim' } })
    expect(questionError(spouseName, namedSpouse)).toBeNull()
    expect(shouldAsk(spouseName, vault({ testator: { maritalStatus: 'single' } }))).toBe(false)
  })

  it('rejects a share percentage on a blank-named beneficiary in any mode', () => {
    const question = willIntakeChapters
      .find((chapter) => chapter.id === 'beneficiaries')!
      .questions.find((item) => item.id === 'beneficiaries')!
    // Previously 60 + 40 passed the 100% check even though one row had no name.
    const state = vault({
      residueDistribution: 'percentages',
      beneficiaries: [
        { id: 'a', fullName: 'Alex Kim', sharePercent: 60 },
        { id: 'b', fullName: '   ', sharePercent: 40 },
      ],
    })
    expect(questionError(question, state)).toBe(UNNAMED_SHARE_ERROR)
    // The blank-named share is an error even outside percentage mode.
    state.residueDistribution = 'equal'
    expect(questionError(question, state)).toBe(UNNAMED_SHARE_ERROR)
    // A blank row WITHOUT a share is ignored and does not distort the total.
    const ignoredBlank = vault({
      residueDistribution: 'percentages',
      beneficiaries: [
        { id: 'a', fullName: 'Alex Kim', sharePercent: 100 },
        { id: 'b', fullName: '' },
      ],
    })
    expect(questionError(question, ignoredBlank)).toBeNull()
  })

  it('computes overall progress over applicable chapters only', () => {
    const empty = vault()
    // A not-applicable chapter contributes nothing to the overall numbers.
    expect(overallProgress(empty, [...willIntakeChapters, conditionalChapter]))
      .toEqual(overallProgress(empty))
    // A vault with only not-applicable chapters reads 0, never 100.
    expect(overallProgress(empty, [conditionalChapter])).toEqual({ pct: 0, requiredUnanswered: 0 })
    // Once the chapter becomes applicable its requirements start counting.
    const included = vault({ spouse: { included: true } })
    expect(overallProgress(included, [conditionalChapter]).requiredUnanswered).toBe(1)
  })
})
