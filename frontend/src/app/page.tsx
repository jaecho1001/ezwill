'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Shield, Clock, Globe, CheckCircle, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LanguageToggle } from '@/components/will/language-toggle'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import { useDraft } from '@/providers/draft-provider'
import { resolveLink } from '@/lib/api/drafts'
import { WILL_STEPS } from '@/lib/constants/steps'
import type { WillDocument } from '@/lib/types/will'

type TokenState = 'idle' | 'resolving' | 'resolved' | 'expired' | 'error'

function HomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { will, dispatch } = useWillForm()
  const { t } = useTranslation()
  const { setDraftId, setToken, draftId } = useDraft()
  const [tokenState, setTokenState] = useState<TokenState>('idle')

  const token = searchParams.get('t')
  const langParam = searchParams.get('lang')

  // Handle language override from URL
  useEffect(() => {
    if (langParam === 'ko') {
      dispatch({ type: 'SET_LANGUAGE', payload: 'ko' })
    }
  }, [langParam, dispatch])

  // Handle magic link token
  useEffect(() => {
    if (!token) return
    setTokenState('resolving')

    resolveLink(token).then(result => {
      if (!result) {
        setTokenState('expired')
        return
      }

      // Store draft context
      setDraftId(result.draft_id)
      setToken(token)

      // Set language from server
      if (result.language && result.language !== will.language) {
        dispatch({ type: 'SET_LANGUAGE', payload: result.language as WillDocument['language'] })
      }

      setTokenState('resolved')

      // Redirect to current step or first step
      const nextStep = result.completed_steps?.length > 0
        ? WILL_STEPS[Math.min(result.completed_steps.length, WILL_STEPS.length - 1)]?.path
        : '/will/about-you'

      setTimeout(() => router.push(nextStep || '/will/about-you'), 800)
    })
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasStarted = draftId || will.completedSteps.length > 0 || will.aboutYou.legalFirstName
  const progress = (will.completedSteps.length / WILL_STEPS.length) * 100

  // Token loading state
  if (tokenState === 'resolving') {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 text-amber-500 animate-spin mx-auto" />
          <p className="text-gray-600 font-medium">Loading your questionnaire…</p>
          <p className="text-gray-400 text-sm">로딩 중…</p>
        </div>
      </div>
    )
  }

  if (tokenState === 'resolved') {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
          <p className="text-gray-700 font-medium">Redirecting to your questionnaire…</p>
        </div>
      </div>
    )
  }

  if (tokenState === 'expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900">This link has expired</h1>
          <p className="text-gray-500">This questionnaire link is no longer valid. Please contact your lawyer to receive a new link.</p>
          <p className="text-gray-400 text-sm">이 링크는 만료되었습니다. 변호사에게 새 링크를 요청하세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
      <header className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
        <span className="text-2xl font-bold text-amber-500">EZWill</span>
        <LanguageToggle />
      </header>

      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          <Shield className="h-3.5 w-3.5" />
          Ontario Will &amp; POA Questionnaire
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-4">
          {t.tagline}
        </h1>
        <p className="text-lg text-gray-500 mb-8 leading-relaxed">
          Answer a few questions. Your lawyer does the rest.
          Ontario-specific legal guidance built in.
        </p>

        {hasStarted && (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 text-left">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">
                Draft in progress
                {will.aboutYou.legalFirstName && ` — ${will.aboutYou.legalFirstName} ${will.aboutYou.legalLastName}`}
              </span>
              <span className="text-amber-600 font-medium">{Math.round(progress)}% complete</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/will/about-you">
            <Button size="xl" className="gap-2 w-full sm:w-auto">
              {hasStarted ? t.continueWill : t.startWill}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          {hasStarted && (
            <Link href="/will/review">
              <Button size="xl" variant="outline" className="w-full sm:w-auto">
                {t.reviewWill}
              </Button>
            </Link>
          )}
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <Clock className="h-6 w-6 text-amber-500 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">~20 minutes</h3>
            <p className="text-sm text-gray-500">Complete at your own pace. Your progress is saved automatically.</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <Shield className="h-6 w-6 text-amber-500 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Ontario-specific</h3>
            <p className="text-sm text-gray-500">Built on the Law Society of Ontario Annotated Will 2026 standard.</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <Globe className="h-6 w-6 text-amber-500 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">English &amp; Korean</h3>
            <p className="text-sm text-gray-500">Fully bilingual. Switch languages at any time.</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          {[
            'Will + Power of Attorney (Property)',
            'Power of Attorney for Personal Care',
            'Henson Trust for ODSP beneficiaries',
            'FLA Exclusion Clause (protects from divorce)',
            'Dual Will strategy for business owners',
            'AI-powered Ontario law alerts',
          ].map(feature => (
            <div key={feature} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              {feature}
            </div>
          ))}
        </div>

        <p className="mt-10 text-xs text-gray-400 max-w-md mx-auto">
          This tool collects information for your lawyer. It is not a legal Will.
          A Will is only valid when signed in person with two witnesses (SLRA s.4).
        </p>
      </main>
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
      </div>
    }>
      <HomePageInner />
    </Suspense>
  )
}
