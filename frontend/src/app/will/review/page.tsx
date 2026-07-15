'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, AlertTriangle, Edit2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { StepHeader } from '@/components/will/step-header'
import { AIFlagBanner } from '@/components/will/ai-flag-banner'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import { useDraft } from '@/providers/draft-provider'
import { submitDraft } from '@/lib/api/drafts'
import { WILL_STEPS } from '@/lib/constants/steps'

function ReviewSection({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        <Link href={href}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-[#1B2A4A] h-7 text-xs">
            <Edit2 className="h-3 w-3" /> {t.review_edit}
          </Button>
        </Link>
      </div>
      <div className="space-y-2 text-sm text-gray-600">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-900 text-xs font-medium text-right">{value || '—'}</span>
    </div>
  )
}

export default function ReviewPage() {
  const { will } = useWillForm()
  const { t } = useTranslation()
  const { draftId, token } = useDraft()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const router = useRouter()

  const criticalFlags = will.aiFlags.filter(f => !f.dismissed && f.severity === 'critical')
  const allStepsComplete = WILL_STEPS.every(s => will.completedSteps.includes(s.id))

  async function handleSubmit() {
    setSubmitError(null)
    if (!draftId) {
      setSubmitError(t.review_errorNoQuestionnaire)
      return
    }
    setSubmitting(true)
    // Pass the client magic token so the draft-bound submit endpoint accepts
    // the request; on /will/* the token is the only auth available.
    const result = await submitDraft(draftId, token ?? undefined)
    setSubmitting(false)
    if (!result) {
      setSubmitError(t.review_errorSubmitFailed)
      return
    }
    router.push('/will/submitted')
  }

  return (
    <div className="fade-in">
      {criticalFlags.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-sm font-semibold text-red-700">{criticalFlags.length} {t.review_criticalIssuesDetected}</p>
          </div>
          <p className="text-xs text-red-600">{t.review_criticalIssuesNote}</p>
        </div>
      )}

      <AIFlagBanner />

      <StepHeader
        section={t.review_finalReview}
        title={t.review}
        description={t.reviewDescription}
      />

      <div className="space-y-4">
        <ReviewSection title={t.review_aboutYou} href="/will/about-you">
          <Field label={t.review_legalName} value={`${will.aboutYou.legalFirstName} ${will.aboutYou.legalLastName}`} />
          <Field label={t.review_dateOfBirth} value={will.aboutYou.dateOfBirth} />
          <Field label={t.review_province} value={will.aboutYou.province} />
          <Field label={t.review_city} value={will.aboutYou.city} />
          <Field label={t.review_email} value={will.aboutYou.email} />
        </ReviewSection>

        <ReviewSection title={t.review_yourFamily} href="/will/your-family">
          <Field label={t.review_maritalStatus} value={will.yourFamily.maritalStatus} />
          {will.yourFamily.spouse && <Field label={t.review_spouse} value={`${will.yourFamily.spouse.firstName} ${will.yourFamily.spouse.lastName}`} />}
          <Field label={t.review_children} value={will.yourFamily.children.length > 0 ? will.yourFamily.children.map(c => `${c.firstName} ${c.lastName}`).join(', ') : t.review_none} />
          <Field label={t.review_guardians} value={will.yourFamily.guardians.length > 0 ? will.yourFamily.guardians.map(g => `${g.firstName} ${g.lastName}`).join(', ') : t.review_none} />
        </ReviewSection>

        <ReviewSection title={t.review_yourEstate} href="/will/your-estate">
          <Field label={t.review_specificGifts} value={will.yourEstate.gifts.length > 0 ? `${will.yourEstate.gifts.length} ${t.review_giftsCount}` : t.review_none} />
          <Field label={t.review_donations} value={will.yourEstate.donations.length > 0 ? will.yourEstate.donations.map(d => d.charityName).join(', ') : t.review_none} />
          <Field label={t.review_beneficiaries} value={will.yourEstate.beneficiaries.map(b => `${b.firstName} ${b.lastName}`).join(', ') || t.review_none} />
          <Field label={t.review_distribution} value={will.yourEstate.residueDistribution} />
          <Field label={t.review_minorTrustAge} value={`${t.review_age} ${will.yourEstate.minorTrustAge}`} />
          <div className="flex gap-2 flex-wrap mt-1">
            {will.yourEstate.includeFLAExclusion && <Badge variant="success" className="text-xs">{t.review_flaExclusion}</Badge>}
            {will.yourEstate.includeGREClause && <Badge variant="success" className="text-xs">{t.review_greClause}</Badge>}
            {will.yourEstate.includeDualWill && <Badge variant="warning" className="text-xs">{t.review_dualWill}</Badge>}
          </div>
        </ReviewSection>

        <ReviewSection title={t.review_yourArrangements} href="/will/your-arrangements">
          <Field label={t.review_executor} value={will.yourArrangements.primaryExecutor ? `${will.yourArrangements.primaryExecutor.firstName} ${will.yourArrangements.primaryExecutor.lastName}` : undefined} />
          <Field label={t.review_backupExecutors} value={will.yourArrangements.backupExecutors.length > 0 ? will.yourArrangements.backupExecutors.map(e => `${e.firstName} ${e.lastName}`).join(', ') : t.review_none} />
          <Field label={t.review_restingPlace} value={will.yourArrangements.restingPlace} />
        </ReviewSection>

        <ReviewSection title={t.review_poaProperty} href="/will/poa-property">
          <Field label={t.review_attorney} value={will.poaProperty.attorney ? `${will.poaProperty.attorney.firstName} ${will.poaProperty.attorney.lastName}` : t.review_notDesignated} />
          <Field label={t.review_effective} value={will.poaProperty.effectiveImmediately ? t.review_immediately : t.review_onIncapacity} />
        </ReviewSection>

        <ReviewSection title={t.review_poaPersonalCare} href="/will/poa-personal-care">
          <Field label={t.review_attorney} value={will.poaPersonalCare.attorney ? `${will.poaPersonalCare.attorney.firstName} ${will.poaPersonalCare.attorney.lastName}` : t.review_notDesignated} />
          <Field label={t.review_lifeSupport} value={will.poaPersonalCare.lifeSupport} />
          <Field label={t.review_organDonation} value={will.poaPersonalCare.organDonation === true ? t.review_yes : will.poaPersonalCare.organDonation === false ? t.review_no : t.review_notSpecified} />
        </ReviewSection>

        <ReviewSection title={t.review_assets} href="/will/assets">
          <Field label={t.review_totalAssetsListed} value={`${will.assets.length} ${t.review_itemsCount}`} />
          {will.assets.slice(0, 5).map(a => (
            <Field key={a.id} label={a.assetType.replace('_', ' ')} value={a.description || a.estimatedValue ? `${a.description}${a.estimatedValue ? ` (~$${a.estimatedValue.toLocaleString()})` : ''}` : undefined} />
          ))}
          {will.assets.length > 5 && <p className="text-xs text-gray-400">+{will.assets.length - 5} {t.review_more}</p>}
        </ReviewSection>
      </div>

      <Separator className="my-6" />

      <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/40 rounded-xl p-5">
        <h3 className="font-semibold text-[#8a6a1e] mb-2">{t.review_whatHappensNext}</h3>
        <ol className="space-y-2 text-sm text-[#8a6a1e]">
          <li className="flex gap-2"><span className="font-bold">1.</span> <span>{t.review_nextStep1}</span></li>
          <li className="flex gap-2"><span className="font-bold">2.</span> <span>{t.review_nextStep2A}{criticalFlags.length > 0 ? `${criticalFlags.length} ${t.review_flaggedIssuesAbove}` : t.review_itemsAbove}{t.review_nextStep2B}</span></li>
          <li className="flex gap-2"><span className="font-bold">3.</span> <span>{t.review_nextStep3}</span></li>
          <li className="flex gap-2"><span className="font-bold">4.</span> <span>{t.review_nextStep4}</span></li>
        </ol>
      </div>

      {submitError && (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Button size="xl" className="flex-1 gap-2" onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> {t.review_submitting}</>
          ) : (
            <><CheckCircle className="h-5 w-5" /> {t.review_submitToLawyer}</>
          )}
        </Button>
        <Button variant="outline" size="xl">
          {t.review_downloadSummaryPdf}
        </Button>
      </div>

      <p className="mt-4 text-xs text-center text-gray-400">
        {t.review_legalDisclaimer}
      </p>
    </div>
  )
}
