'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  Award,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  Globe,
  Loader2,
  Lock,
  Shield,
  Star,
  Users,
} from 'lucide-react'
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
  const startHref = '/will/about-you'

  const trustItems = [
    { icon: Shield, label: 'Built by Ontario lawyers' },
    { icon: Lock, label: 'Private client link flow' },
    { icon: Award, label: 'Lawyer review ready' },
    { icon: Star, label: 'English and Korean' },
  ]

  const processSteps = [
    {
      step: '01',
      title: 'Answer Questions',
      desc: 'Plain-language questions about your family, appointments, property, care wishes, and estate plan.',
      time: '15 min',
    },
    {
      step: '02',
      title: 'Review Your Plan',
      desc: 'See a structured summary before submission, with Ontario-specific alerts surfaced for lawyer review.',
      time: '3 min',
    },
    {
      step: '03',
      title: 'Lawyer Drafting',
      desc: 'Your lawyer reviews the answers, selects clauses, and generates the Will and Powers of Attorney.',
      time: 'Firm-led',
    },
    {
      step: '04',
      title: 'Sign Properly',
      desc: 'Get signing instructions for Ontario requirements, including two witnesses and in-person execution.',
      time: 'Guided',
    },
  ]

  const plans = [
    {
      name: 'Essential Will',
      price: 'Simple',
      desc: 'For straightforward personal estate planning.',
      features: ['Last Will and Testament', 'Executor and backup executor', 'Residue distribution', 'Signing guide'],
      highlighted: false,
    },
    {
      name: 'Complete Package',
      price: 'Most common',
      desc: 'Will plus Powers of Attorney and lawyer-ready review.',
      features: ['Will and both POAs', 'Asset and liability intake', 'Ontario issue flags', 'Review portal'],
      highlighted: true,
    },
    {
      name: 'Short Form',
      price: '2 pages-ish',
      desc: 'For simple wills where the client wants a concise document.',
      features: ['Short-form Will option', 'Core appointments', 'Residue plan', 'Clean document output'],
      highlighted: false,
    },
  ]

  const faqs = [
    {
      q: 'Is this a legal Will by itself?',
      a: 'No. This app collects instructions and generates lawyer-ready drafts. A Will becomes valid only when signed according to Ontario requirements.',
    },
    {
      q: 'Can clients use Korean?',
      a: 'Yes. The questionnaire and intake flow support Korean, while generated legal documents remain in English by design.',
    },
    {
      q: 'What if the client has a complicated situation?',
      a: 'The intake flags issues like trusts, business assets, ODSP, non-resident tax concerns, and other items for lawyer review.',
    },
    {
      q: 'Can the lawyer edit clauses?',
      a: 'Yes. The dashboard includes clause selection and editing tools, including custom phrase and placeholder handling.',
    },
  ]

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
    <div className="min-h-screen bg-[#f7f6f2] text-[#26322f]">
      <nav className="sticky top-0 z-40 border-b border-[#ddd8cd] bg-[#f7f6f2]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#20394f] text-white">
              <FileText className="h-5 w-5" />
            </div>
            <span className="font-serif text-xl font-bold text-[#20394f]">EZWill</span>
          </Link>
          <div className="hidden items-center gap-7 md:flex">
            <a href="#how-it-works" className="text-sm font-medium text-[#4f5c56] hover:text-[#20394f]">How It Works</a>
            <a href="#plans" className="text-sm font-medium text-[#4f5c56] hover:text-[#20394f]">Plans</a>
            <a href="#lawyers" className="text-sm font-medium text-[#4f5c56] hover:text-[#20394f]">Lawyers</a>
            <a href="#faq" className="text-sm font-medium text-[#4f5c56] hover:text-[#20394f]">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Button asChild variant="ghost" className="hidden text-[#20394f] sm:inline-flex">
              <Link href="/dashboard">Log In</Link>
            </Button>
            <Button asChild className="bg-[#20394f] hover:bg-[#172a3c]">
              <Link href={startHref}>
                Start
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden border-b border-[#ddd8cd] bg-[#f7f6f2]">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-[1fr_0.9fr] lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#6f9c82]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d8664]">
                <Shield className="h-3.5 w-3.5" />
                Built for Ontario estate planning workflows
              </div>

              <h1 className="font-serif text-4xl font-bold leading-[1.08] text-[#20394f] sm:text-5xl lg:text-6xl">
                Your family&apos;s future, written in your words.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#5d6762]">
                {t.tagline}. Answer practical questions, preserve your preferences, and give your lawyer a clean Ontario-ready file to review.
              </p>

              {hasStarted && (
                <div className="mt-7 rounded-lg border border-[#ddd8cd] bg-white p-4 shadow-sm">
                  <div className="mb-2 flex justify-between gap-4 text-sm">
                    <span className="text-[#4f5c56]">
                      Draft in progress
                      {will.aboutYou.legalFirstName && ` - ${will.aboutYou.legalFirstName} ${will.aboutYou.legalLastName}`}
                    </span>
                    <span className="font-semibold text-[#4d8664]">{Math.round(progress)}% complete</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#ede9df]">
                    <div className="h-full rounded-full bg-[#6f9c82] transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="xl" className="bg-[#20394f] px-7 text-base hover:bg-[#172a3c]">
                  <Link href={startHref}>
                    {hasStarted ? t.continueWill : 'Start My Will - Free'}
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild size="xl" variant="outline" className="border-[#20394f]/20 bg-white px-7 text-base text-[#20394f] hover:bg-[#eef4ef]">
                  <a href="#how-it-works">See How It Works</a>
                </Button>
                {hasStarted && (
                  <Button asChild size="xl" variant="ghost" className="text-[#20394f]">
                    <Link href="/will/review">{t.reviewWill}</Link>
                  </Button>
                )}
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#66706b]">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />~20 minutes</span>
                <span className="inline-flex items-center gap-1.5"><Lock className="h-4 w-4" />Private link flow</span>
                <span className="inline-flex items-center gap-1.5"><Globe className="h-4 w-4" />English and Korean</span>
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-lg border border-[#d9d3c7] bg-white shadow-2xl shadow-[#20394f]/10">
                <div className="border-b border-[#ede9df] bg-[#20394f] px-5 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/55">Document Builder</p>
                      <p className="mt-1 font-serif text-xl font-semibold">Last Will and Testament</p>
                    </div>
                    <div className="rounded-full bg-[#6f9c82] px-3 py-1 text-xs font-semibold">Ready</div>
                  </div>
                </div>
                <div className="grid gap-0 md:grid-cols-[1fr_180px]">
                  <div className="min-h-[360px] bg-[#fbfaf7] p-6">
                    <div className="mx-auto max-w-sm rounded-sm border border-[#d8d1c4] bg-white p-7 shadow-sm">
                      <div className="mb-6 text-center">
                        <div className="mx-auto mb-3 h-1 w-24 rounded-full bg-[#c7a24a]" />
                        <p className="font-serif text-lg font-bold text-[#20394f]">THIS IS THE LAST WILL</p>
                        <p className="text-xs text-[#7a827d]">of the client named in the questionnaire</p>
                      </div>
                      <div className="space-y-3">
                        {[70, 92, 84, 58, 88, 76, 64].map((width, index) => (
                          <div key={index} className="h-2 rounded-full bg-[#e5dfd3]" style={{ width: `${width}%` }} />
                        ))}
                      </div>
                      <div className="mt-6 space-y-2 rounded-sm border-l-4 border-[#6f9c82] bg-[#eef4ef] p-3">
                        <p className="text-xs font-semibold text-[#20394f]">Executor</p>
                        <div className="h-2 w-2/3 rounded-full bg-[#c8d9ce]" />
                      </div>
                      <div className="mt-5 space-y-2">
                        <div className="h-2 w-11/12 rounded-full bg-[#e5dfd3]" />
                        <div className="h-2 w-9/12 rounded-full bg-[#e5dfd3]" />
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-[#ede9df] bg-white p-5 md:border-l md:border-t-0">
                    {['Client answers', 'Ontario flags', 'Clause review', 'Signing guide'].map((item, index) => (
                      <div key={item} className="mb-4 flex items-start gap-3">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef4ef] text-[#4d8664]">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#20394f]">{item}</p>
                          <p className="text-xs text-[#7a827d]">Step {index + 1}</p>
                        </div>
                      </div>
                    ))}
                    <div className="mt-6 rounded-lg bg-[#f7f6f2] p-3">
                      <p className="text-xs font-semibold text-[#20394f]">Will Generated Successfully</p>
                      <p className="mt-1 text-xs text-[#7a827d]">Documents are ready for lawyer review.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[#ddd8cd] bg-white py-6">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 sm:px-6 md:grid-cols-4 lg:px-8">
            {trustItems.map(item => (
              <div key={item.label} className="flex items-center justify-center gap-2.5 py-2 text-center">
                <item.icon className="h-5 w-5 shrink-0 text-[#c7a24a]" />
                <span className="text-sm font-medium text-[#5d6762]">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="bg-[#f7f6f2] py-18 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4d8664]">Simple Process</p>
              <h2 className="mt-3 font-serif text-3xl font-bold text-[#20394f] md:text-4xl">Four steps to a lawyer-ready file</h2>
              <p className="mt-4 text-[#66706b]">The questionnaire keeps clients focused while giving the firm structured data, flags, and draftable clauses.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-4">
              {processSteps.map(item => (
                <div key={item.step} className="rounded-lg border border-[#ddd8cd] bg-white p-6 shadow-sm transition-colors hover:border-[#c7a24a]/50">
                  <span className="font-serif text-3xl font-bold text-[#c7a24a]/60">{item.step}</span>
                  <h3 className="mt-3 text-base font-semibold text-[#20394f]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#66706b]">{item.desc}</p>
                  <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-[#eef4ef] px-2.5 py-1 text-xs font-medium text-[#4d8664]">
                    <Clock className="h-3 w-3" />
                    {item.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="plans" className="bg-[#20394f] py-18 text-white md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="font-serif text-3xl font-bold md:text-4xl">Choose the level of protection that fits the file</h2>
              <p className="mt-4 text-white/65">The app supports concise wills and fuller estate planning packages without changing the client intake flow.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {plans.map(plan => (
                <div key={plan.name} className={`relative rounded-lg p-7 ${plan.highlighted ? 'bg-white text-[#26322f] ring-2 ring-[#c7a24a]' : 'border border-white/15 bg-white/5'}`}>
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-6 rounded-full bg-[#c7a24a] px-3 py-1 text-xs font-semibold text-white">Most Popular</div>
                  )}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className={`mt-1 text-sm ${plan.highlighted ? 'text-[#66706b]' : 'text-white/55'}`}>{plan.desc}</p>
                  <p className={`mt-5 font-serif text-3xl font-bold ${plan.highlighted ? 'text-[#20394f]' : 'text-white'}`}>{plan.price}</p>
                  <div className="my-6 h-px bg-[#c7a24a]/40" />
                  <ul className="space-y-3">
                    {plan.features.map(feature => (
                      <li key={feature} className={`flex items-start gap-2 text-sm ${plan.highlighted ? 'text-[#4f5c56]' : 'text-white/70'}`}>
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6f9c82]" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className={`mt-7 w-full ${plan.highlighted ? 'bg-[#20394f] hover:bg-[#172a3c]' : 'bg-white text-[#20394f] hover:bg-[#eef4ef]'}`}>
                    <Link href={startHref}>Get Started</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="lawyers" className="bg-white py-18 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4d8664]">Firm Workflow</p>
              <h2 className="mt-3 font-serif text-3xl font-bold text-[#20394f] md:text-4xl">Built for lawyer-assisted estate planning</h2>
              <p className="mt-4 text-[#66706b]">Clients answer in plain language. Lawyers keep control of drafting, clause selection, review, and signing.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                { icon: Users, title: 'Client Intake', text: 'Magic links, bilingual questions, AI intake, and saved progress.' },
                { icon: FileText, title: 'Draft Control', text: 'Clause library, short-form will type, lawyer notes, and Word output.' },
                { icon: Shield, title: 'Review and Signing', text: 'Review portal, approval status, reminders, and Ontario signing guidance.' },
              ].map(item => (
                <div key={item.title} className="rounded-lg border border-[#ddd8cd] bg-[#f7f6f2] p-6">
                  <item.icon className="h-8 w-8 text-[#4d8664]" />
                  <h3 className="mt-4 text-base font-semibold text-[#20394f]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#66706b]">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-[#f7f6f2] py-18 md:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-center font-serif text-3xl font-bold text-[#20394f] md:text-4xl">Common questions</h2>
            <div className="mt-10 space-y-3">
              {faqs.map(item => (
                <details key={item.q} className="rounded-lg border border-[#ddd8cd] bg-white p-5">
                  <summary className="cursor-pointer text-sm font-semibold text-[#20394f]">{item.q}</summary>
                  <p className="mt-3 text-sm leading-6 text-[#66706b]">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#20394f] py-10 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#20394f]">
                <FileText className="h-5 w-5" />
              </div>
              <span className="font-serif text-xl font-bold">EZWill</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/55">
              Lawyer-assisted estate planning intake for Ontario families. This tool is not a substitute for personalized legal advice.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Product</h4>
            <ul className="mt-3 space-y-2 text-sm text-white/55">
              <li><a href="#how-it-works" className="hover:text-white">How It Works</a></li>
              <li><a href="#plans" className="hover:text-white">Plans</a></li>
              <li><Link href={startHref} className="hover:text-white">Start Your Will</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Legal Note</h4>
            <p className="mt-3 text-sm leading-6 text-white/55">
              A Will is only valid when signed according to the Succession Law Reform Act, including the required witnesses.
            </p>
          </div>
        </div>
      </footer>
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
