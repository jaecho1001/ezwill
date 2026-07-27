'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWillVault } from '@/stores/will-vault-store'
import {
  willIntakeChapters,
  chapterProgress,
  intakeErrors,
  overallProgress,
} from '@/lib/intake/will-intake-script'
import { EditableReviewSection } from '@/components/review/editable-review-section'
import { EditableField } from '@/components/review/editable-field'
import { Button } from '@/components/ui/button'
import { createSelfServeDraft, saveVaultToServer, submitDraft } from '@/lib/api/drafts'
import { useDraft } from '@/providers/draft-provider'
import { useEnsureSelfServeDraft } from '@/hooks/use-ensure-draft'

export default function SummaryPage({ params }: { params: Promise<{ willId: string }> }) {
  const { willId } = use(params)
  const router = useRouter()
  const store = useWillVault(willId)
  const vault = store((s) => s.vault)
  const setField = store((s) => s.setField)
  useEnsureSelfServeDraft()
  const { draftId, token, setDraftId, setToken } = useDraft()

  const overall = useMemo(() => overallProgress(vault), [vault])
  const errors = useMemo(() => intakeErrors(vault), [vault])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const progressByChapter = useMemo(() => {
    const out: Record<string, ReturnType<typeof chapterProgress>> = {}
    for (const chapter of willIntakeChapters) out[chapter.id] = chapterProgress(chapter, vault)
    return out
  }, [vault])

  const jumpToChapter = (chapterId: string) => {
    const idx = willIntakeChapters.findIndex((chapter) => chapter.id === chapterId)
    router.push(`/intake/${willId}?chapter=${idx}`)
  }

  const handleSendToLawyer = async () => {
    setSendError(null)
    if (errors.length) {
      setSendError('Please correct the items listed above before sending your answers.')
      return
    }
    if (!confirmed) {
      setSendError('Please confirm that you reviewed your answers.')
      return
    }
    setSending(true)
    try {
      let id = draftId === willId ? draftId : null
      let magicToken = draftId === willId ? token : null
      if (!id) {
        const created = await createSelfServeDraft()
        if (!created) {
          setSendError('Could not reach the server. Please check your connection and try again.')
          return
        }
        setDraftId(created.draft_id)
        setToken(created.token)
        id = created.draft_id
        magicToken = created.token
      }
      const saved = await saveVaultToServer(
        id,
        vault as unknown as Record<string, unknown>,
        { email: vault.testator.email, phone: vault.testator.phone },
        magicToken ?? undefined,
        true,
      )
      if (!saved.ok) {
        setSendError(
          saved.conflict
            ? 'These answers were updated on another device since this page loaded. Reload to review the latest before sending.'
            : 'We could not save your latest answers. Nothing was submitted; please try again.'
        )
        return
      }
      const submitted = await submitDraft(id, magicToken ?? undefined)
      if (!submitted) {
        setSendError('We could not submit this file. It may already have been sent; contact the firm if you are unsure.')
        return
      }
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <header className="rounded-xl border border-[#E8E4DF] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Review your answers</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Check that the information below is accurate. Sending it does not create a final will.
              Your lawyer will review your facts, discuss legal choices, and prepare drafts.
            </p>
          </div>
          <Link className="ml-auto" href={`/intake/${willId}`}>
            <Button variant="outline" size="sm">Back to questionnaire</Button>
          </Link>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
            <span>Required answers complete</span><span>{overall.pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#E8E4DF]">
            <div className="h-2 rounded-full bg-[#7BA68C]" style={{ width: `${overall.pct}%` }} />
          </div>
        </div>
      </header>

      {errors.length > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4" aria-labelledby="answer-errors">
          <h2 id="answer-errors" className="font-semibold text-red-900">Please review {errors.length} item{errors.length === 1 ? '' : 's'}</h2>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {errors.map((error) => (
              <li key={`${error.chapterId}-${error.questionId}`}>
                <button className="text-left underline" onClick={() => jumpToChapter(error.chapterId)}>
                  {error.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-4">
        <EditableReviewSection title="About you" icon="1" completenessPct={progressByChapter.testator.pct}
          notApplicable={!progressByChapter.testator.applicable} onJumpToIntake={() => jumpToChapter('testator')}>
          <EditableField label="Full legal name" value={vault.testator.fullName} onSave={(value) => setField('testator.fullName', value)} />
          <EditableField label="Date of birth" value={vault.testator.dob} kind="date" onSave={(value) => setField('testator.dob', value)} />
          <EditableField label="Address" value={vault.testator.address} onSave={(value) => setField('testator.address', value)} />
          <EditableField label="Email" value={vault.testator.email} onSave={(value) => setField('testator.email', value)} />
          <EditableField label="Marital status" value={vault.testator.maritalStatus} onSave={(value) => setField('testator.maritalStatus', value)} />
        </EditableReviewSection>

        <ReviewListSection title="Family and dependants" icon="2" progress={progressByChapter.family}
          onOpen={() => jumpToChapter('family')} rows={[
            ['Spouse or partner', vault.spouse?.included ? vault.spouse.fullName || 'Name not provided' : 'Not included'],
            ['Children and dependants', names(vault.children)],
            ['Separated', yesNo(vault.spouse?.separated)],
          ]} />

        <ReviewListSection title="Executors and guardians" icon="3" progress={progressByChapter.executors}
          onOpen={() => jumpToChapter('executors')} rows={[
            ['Executors', names(vault.executors)],
            ['Guardians', names(vault.guardians)],
            ['Trust company fallback', vault.corporateTrusteeName],
          ]} />

        <ReviewListSection title="Beneficiaries and residue" icon="4" progress={progressByChapter.beneficiaries}
          onOpen={() => jumpToChapter('beneficiaries')} rows={[
            ['Distribution method', vault.residueDistribution],
            ['Residue beneficiaries', vault.beneficiaries.map((person) =>
              `${person.fullName}${person.sharePercent != null ? ` (${person.sharePercent}%)` : ''}`).join(', ')],
            ['Backup beneficiaries', names(vault.contingentBeneficiaries)],
          ]} />

        <ReviewListSection title="Specific gifts and charities" icon="5" progress={progressByChapter.gifts}
          onOpen={() => jumpToChapter('gifts')} rows={[
            ['Gifts', vault.gifts.length ? vault.gifts.map((gift) => gift.description || gift.charityName || gift.type).join('; ') : 'None provided'],
          ]} />

        <ReviewListSection title="Children and trusts" icon="6" progress={progressByChapter.trusts}
          onOpen={() => jumpToChapter('trusts')} rows={[
            ['Young-beneficiary trust', yesNo(vault.goals.minorChildrenTrust)],
            ['Preferred distribution age', vault.trustDistributionAge],
            ['ODSP / Henson discussion', yesNo(vault.goals.henson)],
            ['Spousal trust discussion', yesNo(vault.goals.spousalTrust)],
          ]} />

        <ReviewListSection title="Assets and debts" icon="7" progress={progressByChapter.assets}
          onOpen={() => jumpToChapter('assets')} rows={[
            ['Approximate net value', vault.assets.estimatedNetWorth != null ? `$${vault.assets.estimatedNetWorth.toLocaleString()}` : undefined],
            ['Assets listed', vault.assets.items?.length],
            ['Debts listed', vault.assets.liabilities?.length],
            ['Private-company interests', yesNo(vault.assets.privateCompanyShares)],
            ['Dual-will review requested', yesNo(vault.goals.dualWillReviewRequested)],
          ]} />

        <ReviewListSection title="Powers of attorney" icon="8" progress={progressByChapter.poa}
          onOpen={() => jumpToChapter('poa')} rows={[
            ['Property POA requested', yesNo(vault.poa.property.requested)],
            ['Property attorneys', names(vault.poa.property.attorneys)],
            ['Personal Care POA requested', yesNo(vault.poa.personalCare.requested)],
            ['Personal Care attorneys', names(vault.poa.personalCare.attorneys)],
          ]} />

        <ReviewListSection title="Final wishes" icon="9" progress={progressByChapter.final}
          onOpen={() => jumpToChapter('final')} rows={[
            ['Resting place', vault.finalWishes.restingPlace],
            ['Ceremony wishes', vault.finalWishes.ceremonyWishes],
            ['Other concerns', vault.finalWishes.otherConcerns],
          ]} />
      </div>

      <section className="rounded-xl border border-[#D8E4DC] bg-[#F2F7F4] p-5">
        {sent ? (
          <div role="status">
            <h2 className="font-semibold text-[#315641]">Your answers were sent to the lawyer</h2>
            <p className="mt-1 text-sm text-[#3d6650]">
              The firm will review the information and contact you at {vault.testator.email}. No final will has been created or filed.
            </p>
          </div>
        ) : (
          <>
            <label className="flex items-start gap-3 text-sm text-gray-800">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>I reviewed these answers and believe they are accurate. I understand that a lawyer must review them before any draft is approved for signing.</span>
            </label>
            <Button className="mt-4 w-full sm:w-auto" onClick={handleSendToLawyer}
              disabled={sending || errors.length > 0 || !confirmed}>
              {sending ? 'Sending…' : 'Send my answers to my lawyer'}
            </Button>
            {sendError && <p className="mt-2 text-sm text-red-700" role="alert">{sendError}</p>}
          </>
        )}
      </section>
    </div>
  )
}

function ReviewListSection({
  title, icon, progress, onOpen, rows,
}: {
  title: string
  icon: string
  progress: { pct: number; applicable: boolean }
  onOpen: () => void
  rows: Array<[string, unknown]>
}) {
  return (
    <EditableReviewSection title={title} icon={icon} completenessPct={progress.pct}
      notApplicable={!progress.applicable} onJumpToIntake={onOpen}>
      {rows.map(([label, value]) => (
        <EditableField key={label} label={label} value={displayValue(value)} onSave={onOpen} />
      ))}
    </EditableReviewSection>
  )
}

function names(items: Array<{ fullName: string }>): string {
  return items.map((item) => item.fullName).filter(Boolean).join(', ') || 'None provided'
}

function yesNo(value?: boolean): string {
  return value === true ? 'Yes' : value === false ? 'No' : 'Not provided'
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not provided'
  return String(value).replaceAll('_', ' ')
}
