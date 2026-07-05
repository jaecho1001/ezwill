'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Award,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Lock,
  Shield,
  Star,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { LanguageToggle } from '@/components/will/language-toggle'
import { useWillForm } from '@/providers/will-form-provider'
import { useDraft } from '@/providers/draft-provider'
import { resolveLink } from '@/lib/api/drafts'
import { WILL_STEPS } from '@/lib/constants/steps'
import type { WillDocument } from '@/lib/types/will'

type TokenState = 'idle' | 'resolving' | 'resolved' | 'expired' | 'error'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] } },
}
const stagger = { visible: { transition: { staggerChildren: 0.08 } } }

/** Inline logo mark — a will document with a growing sprout (legacy + protection).
 *  Single-color via currentColor so it inverts cleanly in the footer. */
function EzWillLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M9 3.5h8.2L23 9.3V25.5a2.5 2.5 0 0 1-2.5 2.5H9a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 9 3.5Z" fill="currentColor" opacity="0.12" />
      <path d="M9 3.5h8.2L23 9.3V25.5a2.5 2.5 0 0 1-2.5 2.5H9a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 9 3.5Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 3.7V8a1.5 1.5 0 0 0 1.5 1.5H22.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 13.5h6M10.5 17h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <path d="M15.6 24.2c0-2.6 1.9-4.5 4.5-4.6-.1 2.6-2 4.5-4.5 4.6Z" fill="currentColor" />
      <path d="M15.6 24.2c0-1.7-1.1-3-2.8-3.1.1 1.7 1.1 3 2.8 3.1Z" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

const navyBtn =
  'bg-[#1B2A4A] text-white hover:bg-[#16233d] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.97]'

function HomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { will, dispatch } = useWillForm()
  const { setDraftId, setToken, draftId } = useDraft()
  const [tokenState, setTokenState] = useState<TokenState>('idle')
  const [mounted, setMounted] = useState(false)

  const token = searchParams.get('t')
  const langParam = searchParams.get('lang')

  // Only read client-only state (localStorage-backed draft/will) after mount,
  // so the server render and first client render match (no hydration mismatch).
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (langParam === 'ko') dispatch({ type: 'SET_LANGUAGE', payload: 'ko' })
  }, [langParam, dispatch])

  // Magic link: resolve token, store draft context, redirect into the flow.
  useEffect(() => {
    if (!token) return
    setTokenState('resolving')
    resolveLink(token).then(result => {
      if (!result) {
        setTokenState('expired')
        return
      }
      setDraftId(result.draft_id)
      setToken(token)
      if (result.language && result.language !== will.language) {
        dispatch({ type: 'SET_LANGUAGE', payload: result.language as WillDocument['language'] })
      }
      setTokenState('resolved')
      const nextStep = result.completed_steps?.length > 0
        ? WILL_STEPS[Math.min(result.completed_steps.length, WILL_STEPS.length - 1)]?.path
        : '/will/about-you'
      setTimeout(() => router.push(nextStep || '/will/about-you'), 800)
    })
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasStarted = mounted && Boolean(draftId || will.completedSteps.length > 0 || will.aboutYou.legalFirstName)
  const nextStepPath = will.completedSteps.length > 0
    ? WILL_STEPS[Math.min(will.completedSteps.length, WILL_STEPS.length - 1)]?.path || '/will/about-you'
    : '/will/about-you'
  const startHref = hasStarted ? nextStepPath : '/will/about-you'
  const startLabel = hasStarted ? 'Continue My Will' : 'Start My Will'

  // ── Magic-link redirect states — a client with a link never sees the marketing page ──
  if (tokenState === 'resolving') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#7BA68C]" />
          <p className="font-medium text-[#1B2A4A]">Loading your questionnaire…</p>
          <p className="text-sm text-[#2D2D2D]/50">로딩 중…</p>
        </div>
      </div>
    )
  }
  if (tokenState === 'resolved') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <div className="space-y-4 text-center">
          <CheckCircle className="mx-auto h-10 w-10 text-[#7BA68C]" />
          <p className="font-medium text-[#1B2A4A]">Redirecting to your questionnaire…</p>
        </div>
      </div>
    )
  }
  if (tokenState === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] px-4">
        <div className="max-w-md space-y-4 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-[#C9A84C]" />
          <h1 className="text-display text-xl font-bold text-[#1B2A4A]">This link has expired</h1>
          <p className="text-[#2D2D2D]/60">This questionnaire link is no longer valid. Please contact your lawyer to receive a new link.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF8F5] text-[#2D2D2D]">
      {/* Navigation */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-[#E8E4DF] bg-[#FAF8F5]/90 backdrop-blur-xl">
        <div className="ezw-container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[#1B2A4A]">
            <EzWillLogo className="h-9 w-9" />
            <span className="text-display text-xl font-bold text-[#1B2A4A]">EzWill</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#how-it-works" className="text-sm font-medium text-[#2D2D2D]/70 transition-colors hover:text-[#1B2A4A]">How It Works</a>
            <a href="#pricing" className="text-sm font-medium text-[#2D2D2D]/70 transition-colors hover:text-[#1B2A4A]">Pricing</a>
            <a href="#about" className="text-sm font-medium text-[#2D2D2D]/70 transition-colors hover:text-[#1B2A4A]">Our Lawyers</a>
            <a href="#faq" className="text-sm font-medium text-[#2D2D2D]/70 transition-colors hover:text-[#1B2A4A]">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block"><LanguageToggle /></div>
            <Link href="/dashboard" className="hidden sm:block">
              <Button variant="ghost" className="text-sm font-medium text-[#1B2A4A]">Log In</Button>
            </Link>
            <Link href={startHref}>
              <Button className={`${navyBtn} rounded-lg px-5 py-2.5 text-sm font-semibold`}>
                {startLabel}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, #1B2A4A 0.5px, transparent 0.5px), radial-gradient(circle at 70% 60%, #7BA68C 0.5px, transparent 0.5px)',
            backgroundSize: '48px 48px, 64px 64px',
          }}
        />
        <div className="ezw-container relative">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <motion.div variants={fadeUp} className="max-w-xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#7BA68C]/20 bg-[#7BA68C]/10 px-3 py-1.5">
                <Shield className="h-3.5 w-3.5 text-[#7BA68C]" />
                <span className="text-xs font-medium text-[#7BA68C]">Built by Ontario Estate Lawyers</span>
              </div>
              <h1 className="text-display mb-6 text-4xl font-bold leading-[1.1] text-[#1B2A4A] md:text-5xl lg:text-[3.5rem]">
                Your family&apos;s future,<br />
                <span className="text-[#7BA68C]">written in your words.</span>
              </h1>
              <p className="mb-8 max-w-md text-lg leading-relaxed text-[#2D2D2D]/70">
                Create your legally binding Ontario will in 20 minutes. No legal knowledge required. Start free — only pay when you&apos;re ready.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link href={startHref}>
                  <Button size="xl" className={`${navyBtn} w-full rounded-lg px-8 text-base font-semibold sm:w-auto`}>
                    {startLabel} — Free
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button variant="outline" size="xl" className="w-full rounded-lg border-[#1B2A4A]/20 px-8 text-base font-medium text-[#1B2A4A] hover:bg-[#1B2A4A]/5 sm:w-auto">
                    See How It Works
                  </Button>
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#2D2D2D]/50">
                <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" /><span>~20 minutes</span></div>
                <div className="flex items-center gap-1.5"><Lock className="h-4 w-4" /><span>256-bit encrypted</span></div>
                <div className="flex items-center gap-1.5"><FileText className="h-4 w-4" /><span>Legally binding</span></div>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className="relative hidden lg:block">
              <div className="relative h-[480px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#20365a] via-[#1B2A4A] to-[#26433a] shadow-2xl shadow-[#1B2A4A]/10">
                <img
                  src="/hero-family.jpg"
                  alt="Family planning their future together"
                  className="h-full w-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1B2A4A]/40 to-transparent" />
                <div className="absolute inset-x-6 bottom-6 rounded-xl bg-white/95 p-4 shadow-lg backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7BA68C]/10">
                      <Check className="h-5 w-5 text-[#7BA68C]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1B2A4A]">Will Generated Successfully</p>
                      <p className="text-xs text-[#2D2D2D]/50">Your documents are ready to download</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="border-y border-[#E8E4DF] bg-white py-6">
        <div className="ezw-container">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { icon: Shield, label: 'Built by Ontario Lawyers' },
              { icon: Lock, label: '256-bit Encryption' },
              { icon: Award, label: 'Law Society Compliant' },
              { icon: Star, label: 'English & Korean' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-center gap-2.5 py-2">
                <item.icon className="h-5 w-5 text-[#C9A84C]" />
                <span className="text-sm font-medium text-[#2D2D2D]/70">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={stagger} className="mb-16 text-center">
            <motion.p variants={fadeUp} className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">Simple Process</motion.p>
            <motion.h2 variants={fadeUp} className="text-display mb-4 text-3xl font-bold text-[#1B2A4A] md:text-4xl">Four steps to peace of mind</motion.h2>
            <motion.p variants={fadeUp} className="mx-auto max-w-2xl text-lg text-[#2D2D2D]/60">
              We&apos;ve simplified estate planning into a guided conversation. No legal jargon, no confusion.
            </motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={stagger} className="grid gap-8 md:grid-cols-4">
            {[
              { step: '01', title: 'Answer Questions', desc: 'Simple questions about your life, family, and wishes — like a conversation with a trusted advisor.', time: '15 min' },
              { step: '02', title: 'Review Your Plan', desc: 'See a clear summary of every choice, with Ontario-specific alerts surfaced for lawyer review.', time: '3 min' },
              { step: '03', title: 'Lawyer Drafting', desc: 'Your lawyer reviews the answers, selects clauses, and generates the Will and Powers of Attorney.', time: 'Firm-led' },
              { step: '04', title: 'Sign Properly', desc: 'Get signing instructions for Ontario requirements, including two witnesses and in-person execution.', time: 'Guided' },
            ].map((item, i) => (
              <motion.div key={i} variants={fadeUp} className="group relative">
                <div className="h-full rounded-xl border border-[#E8E4DF] bg-white p-6 transition-all duration-300 hover:border-[#C9A84C]/30 hover:shadow-lg hover:shadow-[#C9A84C]/5">
                  <span className="text-display text-3xl font-bold text-[#C9A84C]/30 transition-colors group-hover:text-[#C9A84C]/60">{item.step}</span>
                  <h3 className="mt-3 mb-2 text-lg font-semibold text-[#1B2A4A]">{item.title}</h3>
                  <p className="mb-4 text-sm leading-relaxed text-[#2D2D2D]/60">{item.desc}</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#7BA68C]/10 px-2.5 py-1 text-xs font-medium text-[#7BA68C]">
                    <Clock className="h-3 w-3" />{item.time}
                  </span>
                </div>
                {i < 3 && <div className="absolute top-1/2 -right-4 hidden h-px w-8 bg-[#E8E4DF] md:block" />}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Value Comparison */}
      <section className="bg-[#1B2A4A] py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mb-16 text-center">
            <motion.h2 variants={fadeUp} className="text-display mb-4 text-3xl font-bold text-white md:text-4xl">A fraction of the cost. Same legal validity.</motion.h2>
            <motion.p variants={fadeUp} className="mx-auto max-w-2xl text-lg text-white/60">
              EzWill documents are developed by the same Ontario estate lawyers who charge thousands for in-person consultations.
            </motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
            <motion.div variants={fadeUp} className="rounded-xl border border-white/10 bg-white/5 p-8">
              <p className="mb-4 text-sm font-medium uppercase tracking-wider text-white/40">Traditional Lawyer</p>
              <p className="text-display mb-2 text-4xl font-bold text-white/60">$1,500 – $3,000+</p>
              <div className="gold-line my-6 opacity-20" />
              <ul className="space-y-3">
                {['2–4 weeks timeline', 'Multiple office appointments', 'Complex legal jargon', 'Hourly billing surprises'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-white/50"><span className="h-1.5 w-1.5 rounded-full bg-white/30" />{item}</li>
                ))}
              </ul>
            </motion.div>
            <motion.div variants={fadeUp} className="relative rounded-xl border-2 border-[#C9A84C] bg-white p-8">
              <div className="absolute -top-3 left-6 rounded-full bg-[#C9A84C] px-3 py-1 text-xs font-semibold text-white">Recommended</div>
              <p className="mb-4 text-sm font-medium uppercase tracking-wider text-[#7BA68C]">EzWill</p>
              <p className="text-display mb-2 text-4xl font-bold text-[#1B2A4A]">$499 – $899</p>
              <div className="gold-line my-6" />
              <ul className="space-y-3">
                {['Done in about 20 minutes', 'From your couch, anytime', 'Plain language throughout', 'One clear price, no surprises'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[#2D2D2D]"><Check className="h-4 w-4 text-[#7BA68C]" />{item}</li>
                ))}
              </ul>
              <Link href={startHref}>
                <Button className={`${navyBtn} mt-6 w-full rounded-lg py-5 text-sm font-semibold`}>{startLabel} — Free</Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mb-16 text-center">
            <motion.p variants={fadeUp} className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">Plans</motion.p>
            <motion.h2 variants={fadeUp} className="text-display mb-4 text-3xl font-bold text-[#1B2A4A] md:text-4xl">Choose the protection that fits your family</motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
            {[
              { name: 'Essential', price: '$499', desc: 'For individuals with straightforward wishes', features: ['Last Will & Testament', 'Executor & backup executor', 'Residue distribution', 'Free updates for 1 year', 'Signing guide included'], highlighted: false },
              { name: 'Complete', price: '$699', desc: 'For individuals who want full protection', features: ['Everything in Essential', 'Power of Attorney (Property)', 'Power of Attorney (Personal Care)', 'Free updates for 3 years', 'Priority lawyer review'], highlighted: true },
              { name: 'Couples', price: '$899', desc: 'For couples planning together', features: ['Two complete will packages', 'Mirror wills option', 'Shared asset planning', 'Free updates for 5 years', 'Dedicated lawyer support'], highlighted: false },
            ].map((plan, i) => (
              <motion.div key={i} variants={fadeUp} className={`rounded-xl p-8 ${plan.highlighted ? 'relative border border-[#C9A84C] shadow-lg shadow-[#C9A84C]/10' : 'border border-[#E8E4DF] bg-white'}`}>
                {plan.highlighted && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#C9A84C] px-3 py-1 text-xs font-semibold text-white">Most Popular</div>}
                <h3 className="mb-1 text-lg font-semibold text-[#1B2A4A]">{plan.name}</h3>
                <p className="mb-4 text-sm text-[#2D2D2D]/50">{plan.desc}</p>
                <p className="text-display mb-6 text-4xl font-bold text-[#1B2A4A]">{plan.price}</p>
                <ul className="mb-8 space-y-3">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-[#2D2D2D]/70"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7BA68C]" />{f}</li>
                  ))}
                </ul>
                <Link href={startHref}>
                  <Button className={`w-full rounded-lg py-5 text-sm font-semibold ${plan.highlighted ? navyBtn : 'border border-[#1B2A4A]/20 bg-white text-[#1B2A4A] hover:bg-[#1B2A4A]/5'}`}>Get Started</Button>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* About / Lawyers */}
      <section id="about" className="bg-white py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mb-16 text-center">
            <motion.p variants={fadeUp} className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">Our Team</motion.p>
            <motion.h2 variants={fadeUp} className="text-display mb-4 text-3xl font-bold text-[#1B2A4A] md:text-4xl">Developed by Ontario estate lawyers</motion.h2>
            <motion.p variants={fadeUp} className="mx-auto max-w-2xl text-lg text-[#2D2D2D]/60">
              EzWill was built by the legal team at Vaturi &amp; Cho LLP — Ontario estate lawyers who believe everyone deserves access to proper estate planning.
            </motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
            {[
              { name: 'James H. Cho', role: 'Estate Lawyer', exp: 'Ontario wills & estates' },
              { name: 'Sarah Vaturi', role: 'Senior Counsel', exp: 'Wills, trusts & POAs' },
              { name: 'Legal Technology', role: 'Product Team', exp: 'Bridging law and technology' },
            ].map((lawyer, i) => (
              <motion.div key={i} variants={fadeUp} className="text-center">
                <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-[#1B2A4A]/5">
                  <Users className="h-10 w-10 text-[#1B2A4A]/30" />
                </div>
                <h3 className="text-base font-semibold text-[#1B2A4A]">{lawyer.name}</h3>
                <p className="text-sm font-medium text-[#7BA68C]">{lawyer.role}</p>
                <p className="mt-1 text-xs text-[#2D2D2D]/50">{lawyer.exp}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 md:py-28">
        <div className="ezw-container max-w-3xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mb-12 text-center">
            <motion.h2 variants={fadeUp} className="text-display text-3xl font-bold text-[#1B2A4A] md:text-4xl">Common questions</motion.h2>
          </motion.div>
          <Accordion type="single" collapsible className="space-y-3">
            {[
              { q: 'Is this legally valid in Ontario?', a: 'Yes. EzWill documents are developed by licensed Ontario estate lawyers and comply with the Ontario Succession Law Reform Act. When properly signed and witnessed, your will is fully legally binding.' },
              { q: 'Do I need any legal knowledge?', a: "Not at all. We ask you simple questions in plain language about your life, family, and wishes. Our system translates your answers into proper legal structure for your lawyer to finalize." },
              { q: 'Can clients use Korean?', a: 'Yes. The full intake questionnaire is available in English and 한국어 — toggle the language at any time. Your generated legal documents are prepared in English.' },
              { q: 'How long does it take?', a: 'Most people complete the questionnaire in about 20 minutes. You can save your progress with your private link and come back anytime — there is no pressure to finish in one sitting.' },
              { q: 'What if my situation is complicated?', a: 'EzWill is designed for straightforward estate planning, and surfaces Ontario-specific flags for your lawyer. For complex business structures, international assets, or blended-family situations, your lawyer will advise on next steps.' },
              { q: 'Can the lawyer edit clauses?', a: 'Yes. Your answers assemble a draft in the lawyer clause editor, where your lawyer reviews and edits every clause, then generates the final Word document for signing.' },
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="rounded-xl border border-[#E8E4DF] bg-white px-6">
                <AccordionTrigger className="py-5 text-left font-medium text-[#1B2A4A] hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent className="pb-5 leading-relaxed text-[#2D2D2D]/70">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-[#1B2A4A] py-20 md:py-28">
        <div className="ezw-container relative text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-display mb-4 text-3xl font-bold text-white md:text-4xl">Ready to protect your family?</motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mb-8 max-w-xl text-lg text-white/60">
              Start your will now — it&apos;s free until you&apos;re ready. Give your lawyer a clean, Ontario-ready file to review.
            </motion.p>
            <motion.div variants={fadeUp}>
              <Link href={startHref}>
                <Button size="xl" className="rounded-lg bg-[#C9A84C] px-10 text-base font-semibold text-white shadow-lg shadow-[#C9A84C]/20 transition-transform duration-150 hover:scale-[1.02] hover:bg-[#b8973f] active:scale-[0.97]">
                  {startLabel} — Free
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#1B2A4A] py-12 text-white">
        <div className="ezw-container">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="mb-4 flex items-center gap-2 text-white">
                <EzWillLogo className="h-8 w-8" />
                <span className="text-display text-lg font-bold">EzWill</span>
              </div>
              <p className="text-sm leading-relaxed text-white/40">Lawyer-built estate planning intake for Ontario families. A product of Vaturi &amp; Cho LLP.</p>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">Product</h4>
              <ul className="space-y-2">
                <li><a href="#how-it-works" className="text-sm text-white/40 transition-colors hover:text-white/70">How It Works</a></li>
                <li><a href="#pricing" className="text-sm text-white/40 transition-colors hover:text-white/70">Pricing</a></li>
                <li><Link href={startHref} className="text-sm text-white/40 transition-colors hover:text-white/70">Start Your Will</Link></li>
                <li><a href="#faq" className="text-sm text-white/40 transition-colors hover:text-white/70">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">Legal</h4>
              <ul className="space-y-2 text-sm text-white/40">
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
                <li>Accessibility</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold text-white">Contact</h4>
              <ul className="space-y-2 text-sm text-white/40">
                <li>Toronto, Ontario</li>
                <li>Mon–Fri, 9am–5pm EST</li>
              </ul>
            </div>
          </div>
          <div className="gold-line mt-10 mb-6 opacity-30" />
          <p className="text-center text-xs text-white/30">
            © 2026 Vaturi &amp; Cho LLP. This tool is not a substitute for personalized legal advice. A will is only valid when signed according to the Succession Law Reform Act, including the required witnesses.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAF8F5]" />}>
      <HomePageInner />
    </Suspense>
  )
}
