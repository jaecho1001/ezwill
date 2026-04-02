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
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        <Link href={href}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-amber-600 h-7 text-xs">
            <Edit2 className="h-3 w-3" /> Edit
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
  const { draftId } = useDraft()
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  const criticalFlags = will.aiFlags.filter(f => !f.dismissed && f.severity === 'critical')
  const allStepsComplete = WILL_STEPS.every(s => will.completedSteps.includes(s.id))

  async function handleSubmit() {
    setSubmitting(true)
    if (draftId) {
      await submitDraft(draftId)
    }
    router.push('/will/submitted')
  }

  return (
    <div className="fade-in">
      {criticalFlags.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-sm font-semibold text-red-700">{criticalFlags.length} Critical Issue{criticalFlags.length !== 1 ? 's' : ''} Detected</p>
          </div>
          <p className="text-xs text-red-600">Please review the Ontario Law Alerts before proceeding. Your lawyer will need to address these.</p>
        </div>
      )}

      <AIFlagBanner />

      <StepHeader
        section="Final Review"
        title={t.review}
        description={t.reviewDescription}
      />

      <div className="space-y-4">
        <ReviewSection title="About You" href="/will/about-you">
          <Field label="Legal Name" value={`${will.aboutYou.legalFirstName} ${will.aboutYou.legalLastName}`} />
          <Field label="Date of Birth" value={will.aboutYou.dateOfBirth} />
          <Field label="Province" value={will.aboutYou.province} />
          <Field label="City" value={will.aboutYou.city} />
          <Field label="Email" value={will.aboutYou.email} />
        </ReviewSection>

        <ReviewSection title="Your Family" href="/will/your-family">
          <Field label="Marital Status" value={will.yourFamily.maritalStatus} />
          {will.yourFamily.spouse && <Field label="Spouse" value={`${will.yourFamily.spouse.firstName} ${will.yourFamily.spouse.lastName}`} />}
          <Field label="Children" value={will.yourFamily.children.length > 0 ? will.yourFamily.children.map(c => `${c.firstName} ${c.lastName}`).join(', ') : 'None'} />
          <Field label="Guardians" value={will.yourFamily.guardians.length > 0 ? will.yourFamily.guardians.map(g => `${g.firstName} ${g.lastName}`).join(', ') : 'None'} />
        </ReviewSection>

        <ReviewSection title="Your Estate" href="/will/your-estate">
          <Field label="Specific Gifts" value={will.yourEstate.gifts.length > 0 ? `${will.yourEstate.gifts.length} gift(s)` : 'None'} />
          <Field label="Donations" value={will.yourEstate.donations.length > 0 ? will.yourEstate.donations.map(d => d.charityName).join(', ') : 'None'} />
          <Field label="Beneficiaries" value={will.yourEstate.beneficiaries.map(b => `${b.firstName} ${b.lastName}`).join(', ') || 'None'} />
          <Field label="Distribution" value={will.yourEstate.residueDistribution} />
          <Field label="Minor Trust Age" value={`Age ${will.yourEstate.minorTrustAge}`} />
          <div className="flex gap-2 flex-wrap mt-1">
            {will.yourEstate.includeFLAExclusion && <Badge variant="success" className="text-xs">FLA Exclusion</Badge>}
            {will.yourEstate.includeGREClause && <Badge variant="success" className="text-xs">GRE Clause</Badge>}
            {will.yourEstate.includeDualWill && <Badge variant="warning" className="text-xs">Dual Will</Badge>}
          </div>
        </ReviewSection>

        <ReviewSection title="Your Arrangements" href="/will/your-arrangements">
          <Field label="Executor" value={will.yourArrangements.primaryExecutor ? `${will.yourArrangements.primaryExecutor.firstName} ${will.yourArrangements.primaryExecutor.lastName}` : undefined} />
          <Field label="Backup Executors" value={will.yourArrangements.backupExecutors.length > 0 ? will.yourArrangements.backupExecutors.map(e => `${e.firstName} ${e.lastName}`).join(', ') : 'None'} />
          <Field label="Resting Place" value={will.yourArrangements.restingPlace} />
        </ReviewSection>

        <ReviewSection title="Power of Attorney — Property" href="/will/poa-property">
          <Field label="Attorney" value={will.poaProperty.attorney ? `${will.poaProperty.attorney.firstName} ${will.poaProperty.attorney.lastName}` : 'Not designated'} />
          <Field label="Effective" value={will.poaProperty.effectiveImmediately ? 'Immediately' : 'On incapacity'} />
        </ReviewSection>

        <ReviewSection title="Power of Attorney — Personal Care" href="/will/poa-personal-care">
          <Field label="Attorney" value={will.poaPersonalCare.attorney ? `${will.poaPersonalCare.attorney.firstName} ${will.poaPersonalCare.attorney.lastName}` : 'Not designated'} />
          <Field label="Life Support" value={will.poaPersonalCare.lifeSupport} />
          <Field label="Organ Donation" value={will.poaPersonalCare.organDonation === true ? 'Yes' : will.poaPersonalCare.organDonation === false ? 'No' : 'Not specified'} />
        </ReviewSection>

        <ReviewSection title="Assets" href="/will/assets">
          <Field label="Total Assets Listed" value={`${will.assets.length} item(s)`} />
          {will.assets.slice(0, 5).map(a => (
            <Field key={a.id} label={a.assetType.replace('_', ' ')} value={a.description || a.estimatedValue ? `${a.description}${a.estimatedValue ? ` (~$${a.estimatedValue.toLocaleString()})` : ''}` : undefined} />
          ))}
          {will.assets.length > 5 && <p className="text-xs text-gray-400">+{will.assets.length - 5} more</p>}
        </ReviewSection>
      </div>

      <Separator className="my-6" />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="font-semibold text-amber-900 mb-2">What Happens Next?</h3>
        <ol className="space-y-2 text-sm text-amber-800">
          <li className="flex gap-2"><span className="font-bold">1.</span> <span>Your answers will be sent to your lawyer for review.</span></li>
          <li className="flex gap-2"><span className="font-bold">2.</span> <span>Your lawyer will draft the legal documents and contact you to discuss any issues (including the {criticalFlags.length > 0 ? criticalFlags.length + ' flagged issues above' : 'items above'}).</span></li>
          <li className="flex gap-2"><span className="font-bold">3.</span> <span>You will sign your Will in person with 2 witnesses. Ontario does NOT permit fully electronic Wills — physical signing is required (SLRA s.4).</span></li>
          <li className="flex gap-2"><span className="font-bold">4.</span> <span>Your POAs are signed separately with 1 witness and no beneficiaries as witnesses.</span></li>
        </ol>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Button size="xl" className="flex-1 gap-2" onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Submitting...</>
          ) : (
            <><CheckCircle className="h-5 w-5" /> Submit to My Lawyer</>
          )}
        </Button>
        <Button variant="outline" size="xl">
          Download Summary PDF
        </Button>
      </div>

      <p className="mt-4 text-xs text-center text-gray-400">
        This questionnaire collects information for your lawyer. It does not constitute legal advice and is not a valid legal Will until properly executed.
      </p>
    </div>
  )
}
