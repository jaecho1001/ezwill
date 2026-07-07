'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { resolveReviewToken, type ReviewData, type ReviewDocument } from '@/lib/api/review'

const DOCUMENT_ICONS: Record<string, string> = {
  simple_will_short: '\u{1F4DD}',
  single_will: '\u{1F4DC}',
  probate_will: '\u{1F4CB}',
  non_probate_will: '\u{1F4C4}',
  poa_property: '\u{1F3E0}',
  poa_personal_care: '\u{2764}\u{FE0F}',
  affidavit_execution: '\u{1F58A}\u{FE0F}',
  affidavit_execution_probate: '\u{1F58A}\u{FE0F}',
  affidavit_execution_non_probate: '\u{1F58A}\u{FE0F}',
}

const STATUS_CONFIG = {
  pending: {
    en: 'Pending Your Review',
    ko: '\uAC80\uD1A0 \uB300\uAE30 \uC911',
    color: 'bg-[#C9A84C]/15 text-[#8a6a1e]',
  },
  reviewed: {
    en: 'Reviewed',
    ko: '\uAC80\uD1A0 \uC644\uB8CC',
    color: 'bg-blue-100 text-blue-800',
  },
  approved: {
    en: 'Approved',
    ko: '\uC2B9\uC778 \uC644\uB8CC',
    color: 'bg-emerald-100 text-emerald-800',
  },
}

const t = {
  en: {
    welcome: 'Welcome',
    subtitle: 'Your lawyer has prepared the following documents for your review.',
    instruction:
      'Please review each document carefully. Once you understand and agree with the contents, approve each document.',
    review: 'Review',
    viewAgain: 'View Again',
    progress: 'Overall Progress',
    loading: 'Loading your documents...',
    expired: 'This review link has expired or is invalid.',
    expiredSub: 'Please contact your lawyer for a new link.',
    noDocuments: 'No documents are ready for review yet.',
    noDocumentsSub: 'Your lawyer will notify you when documents are available.',
    allApproved: 'All documents approved!',
    allApprovedSub: 'Proceed to the next step.',
    nextStep: 'Continue',
  },
  ko: {
    welcome: '\uD658\uC601\uD569\uB2C8\uB2E4',
    subtitle: '\uB2F4\uB2F9 \uBCC0\uD638\uC0AC\uAC00 \uB2E4\uC74C \uBB38\uC11C\uB97C \uAC80\uD1A0\uC6A9\uC73C\uB85C \uC900\uBE44\uD588\uC2B5\uB2C8\uB2E4.',
    instruction:
      '\uAC01 \uBB38\uC11C\uB97C \uC8FC\uC758 \uAE4A\uAC8C \uAC80\uD1A0\uD574 \uC8FC\uC2ED\uC2DC\uC624. \uB0B4\uC6A9\uC744 \uC774\uD574\uD558\uACE0 \uB3D9\uC758\uD558\uC2DC\uBA74 \uAC01 \uBB38\uC11C\uB97C \uC2B9\uC778\uD574 \uC8FC\uC138\uC694.',
    review: '\uAC80\uD1A0\uD558\uAE30',
    viewAgain: '\uB2E4\uC2DC \uBCF4\uAE30',
    progress: '\uC804\uCCB4 \uC9C4\uD589 \uC0C1\uD669',
    loading: '\uBB38\uC11C\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...',
    expired: '\uC774 \uAC80\uD1A0 \uB9C1\uD06C\uAC00 \uB9CC\uB8CC\uB418\uC5C8\uAC70\uB098 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
    expiredSub: '\uC0C8 \uB9C1\uD06C\uB97C \uBC1B\uC73C\uB824\uBA74 \uB2F4\uB2F9 \uBCC0\uD638\uC0AC\uC5D0\uAC8C \uC5F0\uB77D\uD574 \uC8FC\uC138\uC694.',
    noDocuments: '\uC544\uC9C1 \uAC80\uD1A0\uD560 \uBB38\uC11C\uAC00 \uC900\uBE44\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.',
    noDocumentsSub: '\uBB38\uC11C\uAC00 \uC900\uBE44\uB418\uBA74 \uBCC0\uD638\uC0AC\uAC00 \uC54C\uB824\uB4DC\uB9BD\uB2C8\uB2E4.',
    allApproved: '\uBAA8\uB4E0 \uBB38\uC11C\uAC00 \uC2B9\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4!',
    allApprovedSub: '\uB2E4\uC74C \uB2E8\uACC4\uB85C \uC9C4\uD589\uD574 \uC8FC\uC138\uC694.',
    nextStep: '\uACC4\uC18D',
  },
}

export default function ReviewLandingPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    }>
      <ReviewLandingContent />
    </Suspense>
  )
}

function ReviewLandingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('t') || ''

  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!token) {
      setError(true)
      setLoading(false)
      return
    }
    resolveReviewToken(token).then((result) => {
      if (result) {
        setData(result)
      } else {
        setError(true)
      }
      setLoading(false)
    })
  }, [token])

  const lang = data?.language || 'en'
  const labels = t[lang]

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
        <p className="mt-4 text-sm text-stone-500">{t.en.loading}</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-stone-800">{t.en.expired}</h2>
        <p className="mt-1 text-sm text-stone-500">{t.en.expiredSub}</p>
      </div>
    )
  }

  const documents = data.documents || []
  const approvedCount = documents.filter((d) => d.status === 'approved').length
  const totalCount = documents.length
  const progressPercent = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0

  if (data.all_approved) {
    router.push(`/review/complete?t=${token}`)
    return null
  }

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="text-center">
        <h1 className="text-2xl font-serif font-semibold text-stone-800">
          {labels.welcome}, {data.client_name}
        </h1>
        <p className="mt-2 text-sm text-stone-600">{labels.subtitle}</p>
        <p className="mt-1 text-xs text-stone-400">{labels.instruction}</p>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-stone-700">{labels.progress}</span>
            <span className="text-stone-500">
              {approvedCount} / {totalCount} ({progressPercent}%)
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Document cards */}
      {documents.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-stone-600">{labels.noDocuments}</p>
          <p className="mt-1 text-xs text-stone-400">{labels.noDocumentsSub}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.document_type}
              doc={doc}
              lang={lang}
              token={token}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentCard({
  doc,
  lang,
  token,
}: {
  doc: ReviewDocument
  lang: 'en' | 'ko'
  token: string
}) {
  const router = useRouter()
  const labels = t[lang]
  const status = STATUS_CONFIG[doc.status]
  const icon = DOCUMENT_ICONS[doc.document_type] || '\u{1F4C4}'

  return (
    <div className="flex items-center gap-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-stone-100 text-2xl">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-stone-800 truncate">{doc.title}</h3>
        <div className="mt-1 flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
            {status[lang]}
          </span>
          {doc.comments_count > 0 && (
            <span className="text-xs text-stone-400">
              {doc.comments_count} comment{doc.comments_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => router.push(`/review/${doc.document_type}?t=${token}`)}
        className={`flex-shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          doc.status === 'approved'
            ? 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
            : 'bg-stone-800 text-white hover:bg-stone-700'
        }`}
      >
        {doc.status === 'approved' ? labels.viewAgain : labels.review}
      </button>
    </div>
  )
}
