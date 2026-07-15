'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWillVault } from '@/stores/will-vault-store'
import { willIntakeChapters, chapterProgress, overallProgress } from '@/lib/intake/will-intake-script'
import { EditableReviewSection } from '@/components/review/editable-review-section'
import { EditableField } from '@/components/review/editable-field'
import { determineRequiredDocuments, getDocumentTypeConfig } from '@/lib/will-documents/index'
import { Button } from '@/components/ui/button'
import { generateAllDocuments, downloadBlob } from '@/lib/api/documents'

export default function SummaryPage({ params }: { params: Promise<{ willId: string }> }) {
  const { willId } = use(params)
  const router = useRouter()
  const store = useWillVault(willId)
  const vault = store((s) => s.vault)
  const setField = store((s) => s.setField)

  const overall = useMemo(() => overallProgress(vault), [vault])
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateError(null)
    try {
      const { blob, filename } = await generateAllDocuments(willId)
      downloadBlob(blob, filename)
    } catch (err) {
      setGenerateError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }
  const pctByChapter = useMemo(() => {
    const out: Record<string, number> = {}
    for (const ch of willIntakeChapters) out[ch.id] = chapterProgress(ch, vault).pct
    return out
  }, [vault])

  const requiredDocs = useMemo(
    () =>
      determineRequiredDocuments({
        tier: vault.goals.hasDualWill ? 2 : 1,
        hasDualWill: !!vault.goals.hasDualWill,
        hasPoaProperty: !!vault.goals.hasPoaProperty,
        hasPoaPersonalCare: !!vault.goals.hasPoaPersonalCare,
      }),
    [vault.goals]
  )

  const jumpToChapter = (chapterId: string) => {
    const idx = willIntakeChapters.findIndex((c) => c.id === chapterId)
    router.push(`/intake/${willId}?chapter=${idx}`)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      {/* Header */}
      <header className="rounded-xl border border-[#E8E4DF] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Review & Generate</h1>
            <p className="text-xs text-gray-500">
              Everything you told us, in one place. Edit any field inline, then generate your documents.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href={`/intake/${willId}`}>
              <Button variant="outline" size="sm">
                ← Back to wizard
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={overall.requiredUnanswered > 0 || generating}
            >
              {generating ? 'Generating…' : 'Generate all documents'}
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
            <span>Completion</span>
            <span>{overall.pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#E8E4DF]">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-[#1B2A4A] to-[#7BA68C] transition-all"
              style={{ width: `${overall.pct}%` }}
            />
          </div>
          {overall.requiredUnanswered > 0 && (
            <p className="mt-2 text-[11px] text-[#8a6a1e]">
              {overall.requiredUnanswered} required field{overall.requiredUnanswered === 1 ? '' : 's'} still empty.
            </p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4">
        {/* Left — editable review sections */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <EditableReviewSection title="Testator" icon="👤" completenessPct={pctByChapter.testator} onJumpToIntake={() => jumpToChapter('testator')}>
            <EditableField label="Full legal name" value={vault.testator.fullName} onSave={(v) => setField('testator.fullName', v)} />
            <EditableField label="Date of birth" value={vault.testator.dob} kind="date" onSave={(v) => setField('testator.dob', v)} />
            <EditableField label="Address" value={vault.testator.address} onSave={(v) => setField('testator.address', v)} />
            <EditableField label="Marital status" value={vault.testator.maritalStatus} onSave={(v) => setField('testator.maritalStatus', v)} />
            <EditableField label="Occupation" value={vault.testator.occupation} onSave={(v) => setField('testator.occupation', v)} />
          </EditableReviewSection>

          <EditableReviewSection title="Family" icon="👨‍👩‍👧" completenessPct={pctByChapter.family} onJumpToIntake={() => jumpToChapter('family')}>
            <EditableField label="Include spouse" value={vault.spouse?.included} kind="boolean" onSave={(v) => setField('spouse.included', v)} />
            <EditableField label="Spouse name" value={vault.spouse?.fullName} onSave={(v) => setField('spouse.fullName', v)} />
            <EditableField
              label="Children"
              value={vault.children.map((c) => c.fullName).filter(Boolean).join(', ')}
              display={(v) => (v ? String(v) : '')}
              onSave={() => jumpToChapter('family')}
            />
          </EditableReviewSection>

          <EditableReviewSection title="Executors & Guardians" icon="🛡️" completenessPct={pctByChapter.executors} onJumpToIntake={() => jumpToChapter('executors')}>
            <EditableField
              label="Primary executor"
              value={vault.executors.find((e) => !e.isBackup)?.fullName}
              onSave={() => jumpToChapter('executors')}
            />
            <EditableField
              label="Backup executor"
              value={vault.executors.find((e) => e.isBackup)?.fullName}
              onSave={() => jumpToChapter('executors')}
            />
            <EditableField
              label="Primary guardian"
              value={vault.guardians.find((g) => !g.isBackup)?.fullName}
              onSave={() => jumpToChapter('executors')}
            />
          </EditableReviewSection>

          <EditableReviewSection title="Beneficiaries" icon="🎁" completenessPct={pctByChapter.beneficiaries} onJumpToIntake={() => jumpToChapter('beneficiaries')}>
            <EditableField
              label="Residue beneficiaries"
              value={vault.beneficiaries.map((b) => b.fullName).filter(Boolean).join(', ')}
              onSave={() => jumpToChapter('beneficiaries')}
            />
            <EditableField label="Charitable giving" value={vault.goals.charitableGiving} kind="boolean" onSave={(v) => setField('goals.charitableGiving', v)} />
          </EditableReviewSection>

          <EditableReviewSection title="Assets & Strategy" icon="💼" completenessPct={pctByChapter.assets} onJumpToIntake={() => jumpToChapter('assets')}>
            <EditableField label="Estimated net worth" value={vault.assets.estimatedNetWorth} kind="number" onSave={(v) => setField('assets.estimatedNetWorth', v)} />
            <EditableField label="Private-co. shares" value={vault.assets.privateCompanyShares} kind="boolean" onSave={(v) => setField('assets.privateCompanyShares', v)} />
            <EditableField label="Dual-will strategy" value={vault.goals.hasDualWill} kind="boolean" onSave={(v) => setField('goals.hasDualWill', v)} />
            <EditableField label="Life insurance" value={vault.assets.lifeInsurance} kind="boolean" onSave={(v) => setField('assets.lifeInsurance', v)} />
          </EditableReviewSection>

          <EditableReviewSection title="Special provisions" icon="⭐" completenessPct={pctByChapter.special} onJumpToIntake={() => jumpToChapter('special')}>
            <EditableField label="Henson trust" value={vault.goals.henson} kind="boolean" onSave={(v) => setField('goals.henson', v)} />
            <EditableField label="Minor children trust" value={vault.goals.minorChildrenTrust} kind="boolean" onSave={(v) => setField('goals.minorChildrenTrust', v)} />
            <EditableField label="POA Property" value={vault.goals.hasPoaProperty} kind="boolean" onSave={(v) => setField('goals.hasPoaProperty', v)} />
            <EditableField label="POA Personal Care" value={vault.goals.hasPoaPersonalCare} kind="boolean" onSave={(v) => setField('goals.hasPoaPersonalCare', v)} />
          </EditableReviewSection>
        </div>

        {/* Right — documents sidebar */}
        <aside className="col-span-12 lg:col-span-4">
          <div className="sticky top-4 rounded-xl border border-[#E8E4DF] bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Documents to be generated
            </h3>
            <ul className="mt-3 space-y-2">
              {requiredDocs.map((docId) => {
                const cfg = getDocumentTypeConfig(docId)
                return (
                  <li key={docId} className="flex items-start gap-2 rounded-md border border-[#E8E4DF] bg-[#FAF8F5] p-2">
                    <span className="text-lg leading-none">{cfg?.icon ?? '📄'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900">{cfg?.shortName ?? docId}</div>
                      <div className="text-[11px] text-gray-500 leading-snug">{cfg?.description}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 space-y-2">
              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={overall.requiredUnanswered > 0 || generating}
              >
                {generating ? 'Generating…' : 'Generate all documents'}
              </Button>
              <Button variant="outline" className="w-full">
                Send to lawyer for review
              </Button>
              {generateError && (
                <p className="text-[11px] text-red-600 text-center">{generateError}</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
