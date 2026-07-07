'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { resolveReviewToken, type ReviewData } from '@/lib/api/review'

const text = {
  en: {
    thankYou: 'Thank you',
    allApproved: 'All documents have been approved.',
    nextSteps: 'Next Steps',
    step1: 'Your lawyer will contact you to arrange a signing appointment.',
    step2:
      'Under the Succession Law Reform Act (SLRA), your Will must be signed in the presence of two witnesses.',
    step3:
      'Please bring valid government-issued photo identification to the signing appointment.',
    signingTitle: 'SLRA Signing Requirements',
    signingReq1: 'The testator (you) must sign in the presence of two witnesses.',
    signingReq2: 'Both witnesses must sign in the presence of the testator and each other.',
    signingReq3: 'Witnesses cannot be beneficiaries or spouses of beneficiaries under the Will.',
    signingReq4: 'Remote video signing is available under SLRA s.21.1 (one witness must be an LSO licensee).',
    contactTitle: 'Questions?',
    contactMsg: 'Contact your lawyer at Vaturi & Cho LLP if you have any questions about the signing process.',
    firmPhone: '(416) 505-5901',
    firmEmail: 'info@vaturitylaw.com',
    backToDocuments: 'Back to Documents',
  },
  ko: {
    thankYou: '\uAC10\uC0AC\uD569\uB2C8\uB2E4',
    allApproved: '\uBAA8\uB4E0 \uBB38\uC11C\uAC00 \uC2B9\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4.',
    nextSteps: '\uB2E4\uC74C \uB2E8\uACC4',
    step1: '\uB2F4\uB2F9 \uBCC0\uD638\uC0AC\uAC00 \uC11C\uBA85 \uC77C\uC815\uC744 \uC7A1\uAE30 \uC704\uD574 \uC5F0\uB77D\uB4DC\uB9B4 \uC608\uC815\uC785\uB2C8\uB2E4.',
    step2:
      '\uC720\uC5B8\uAC80\uC778\uBC95(SLRA)\uC5D0 \uB530\uB77C \uC720\uC5B8\uC7A5\uC740 \uB450 \uBA85\uC758 \uC99D\uC778 \uC55E\uC5D0\uC11C \uC11C\uBA85\uD574\uC57C \uD569\uB2C8\uB2E4.',
    step3:
      '\uC11C\uBA85 \uC57D\uC18D\uC5D0 \uC720\uD6A8\uD55C \uC815\uBD80 \uBC1C\uD589 \uC0AC\uC9C4 \uC2E0\uBD84\uC99D\uC744 \uC9C0\uCC38\uD574 \uC8FC\uC138\uC694.',
    signingTitle: 'SLRA \uC11C\uBA85 \uC694\uAC74',
    signingReq1: '\uC720\uC5B8\uC790(\uBCF8\uC778)\uB294 \uB450 \uBA85\uC758 \uC99D\uC778 \uC55E\uC5D0\uC11C \uC11C\uBA85\uD574\uC57C \uD569\uB2C8\uB2E4.',
    signingReq2: '\uB450 \uC99D\uC778\uC740 \uC720\uC5B8\uC790\uC640 \uC11C\uB85C\uC758 \uBA74\uC804\uC5D0\uC11C \uC11C\uBA85\uD574\uC57C \uD569\uB2C8\uB2E4.',
    signingReq3: '\uC99D\uC778\uC740 \uC720\uC5B8\uC758 \uC218\uC775\uC790\uB098 \uC218\uC775\uC790\uC758 \uBC30\uC6B0\uC790\uAC00 \uB420 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
    signingReq4: 'SLRA s.21.1\uC5D0 \uB530\uB77C \uC6D0\uACA9 \uD654\uC0C1 \uC11C\uBA85\uC774 \uAC00\uB2A5\uD569\uB2C8\uB2E4 (\uC99D\uC778 \uC911 \uD55C \uBA85\uC740 LSO \uBA74\uD5C8 \uBCF4\uC720\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4).',
    contactTitle: '\uBB38\uC758\uC0AC\uD56D\uC774 \uC788\uC73C\uC2E0\uAC00\uC694?',
    contactMsg: '\uC11C\uBA85 \uC808\uCC28\uC5D0 \uB300\uD574 \uAD81\uAE08\uD55C \uC810\uC774 \uC788\uC73C\uC2DC\uBA74 Vaturi & Cho LLP\uC5D0 \uBB38\uC758\uD574 \uC8FC\uC138\uC694.',
    firmPhone: '(416) 505-5901',
    firmEmail: 'info@vaturitylaw.com',
    backToDocuments: '\uBB38\uC11C \uBAA9\uB85D\uC73C\uB85C',
  },
}

export default function ReviewCompletePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    }>
      <ReviewCompleteContent />
    </Suspense>
  )
}

function ReviewCompleteContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('t') || ''

  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    resolveReviewToken(token).then((result) => {
      if (result) setData(result)
      setLoading(false)
    })
  }, [token])

  const lang = data?.language || 'en'
  const t = text[lang]

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    )
  }

  const clientName = data?.client_name || ''

  return (
    <div className="space-y-8">
      {/* Success header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
          <svg className="h-10 w-10 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-serif font-semibold text-stone-800">
          {t.thankYou}{clientName ? `, ${clientName}` : ''}!
        </h1>
        <p className="mt-2 text-sm text-stone-600">{t.allApproved}</p>
      </div>

      {/* Next steps */}
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-800">{t.nextSteps}</h2>
        <ol className="mt-4 space-y-3">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
              1
            </span>
            <p className="text-sm text-stone-700">{t.step1}</p>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
              2
            </span>
            <p className="text-sm text-stone-700">{t.step2}</p>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
              3
            </span>
            <p className="text-sm text-stone-700">{t.step3}</p>
          </li>
        </ol>
      </div>

      {/* SLRA signing requirements */}
      <div className="rounded-lg border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#8a6a1e]">
          <svg className="h-5 w-5 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {t.signingTitle}
        </h3>
        <ul className="mt-3 space-y-2">
          {[t.signingReq1, t.signingReq2, t.signingReq3, t.signingReq4].map((req, i) => (
            <li key={i} className="flex gap-2 text-xs text-[#8a6a1e]">
              <span className="mt-0.5 flex-shrink-0 text-[#C9A84C]">&#8226;</span>
              {req}
            </li>
          ))}
        </ul>
      </div>

      {/* Contact info */}
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm text-center">
        <h3 className="text-sm font-semibold text-stone-800">{t.contactTitle}</h3>
        <p className="mt-2 text-sm text-stone-600">{t.contactMsg}</p>
        <div className="mt-3 flex flex-col items-center gap-1 text-sm text-stone-500">
          <span>{t.firmPhone}</span>
          <span>{t.firmEmail}</span>
        </div>
      </div>
    </div>
  )
}
