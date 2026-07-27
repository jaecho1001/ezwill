'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, MotionConfig, useReducedMotion, useInView } from 'framer-motion'
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Lock,
  ScrollText,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { EzWillLogo } from '@/components/ui/brand'
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
// Word-level headline "write-on": each word rises and fades in sequence.
const wordContainer = { hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }
const wordUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] } },
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
  // MotionConfig reducedMotion="user" only suppresses TRANSFORM/LAYOUT (positional)
  // keys — NOT pathLength or boxShadow. Guard those two by hand with this flag.
  const reduce = useReducedMotion()

  // Sticky mini-CTA: appears only after the hero has scrolled out of view.
  const heroRef = useRef<HTMLElement>(null)
  const heroInView = useInView(heroRef, { margin: '-80px' })
  const [heroSeen, setHeroSeen] = useState(false)
  const [stickyDismissed, setStickyDismissed] = useState(false)
  useEffect(() => { if (heroInView) setHeroSeen(true) }, [heroInView])

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
      setTimeout(() => router.push(`/intake/${result.draft_id}?t=${encodeURIComponent(token)}`), 800)
    })
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasStarted = mounted && Boolean(draftId || will.completedSteps.length > 0 || will.aboutYou.legalFirstName)
  const nextStepPath = will.completedSteps.length > 0
    ? WILL_STEPS[Math.min(will.completedSteps.length, WILL_STEPS.length - 1)]?.path || '/will/about-you'
    : '/will/about-you'
  const startHref = hasStarted ? nextStepPath : '/will/about-you'
  const startLabel = hasStarted ? 'Continue My Will' : 'Start My Will'
  const showSticky = mounted && heroSeen && !heroInView && !stickyDismissed

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

  const heroHeadlineLine1 = ['Your', 'love,', 'in', 'writing', '—']
  const heroHeadlineLine2 = ['so', 'they', 'never', 'have', 'to', 'guess.']

  return (
    <MotionConfig reducedMotion="user">
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
      <section ref={heroRef} className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: 'url(/hero-abstract.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
        <div className="ezw-container relative">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <motion.div variants={fadeUp} className="max-w-xl">
              <motion.div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#7BA68C]/20 bg-[#7BA68C]/10 px-3 py-1.5">
                <motion.span animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
                  <Shield className="h-3.5 w-3.5 text-[#7BA68C]" />
                </motion.span>
                <span className="text-xs font-medium text-[#7BA68C]">Built with Ontario Estate Lawyers · Vaturi &amp; Cho LLP</span>
              </motion.div>

              <motion.h1
                variants={wordContainer}
                className="text-display mb-6 text-4xl font-bold leading-[1.1] text-[#1B2A4A] md:text-5xl lg:text-[3.5rem]"
              >
                <span className="block">
                  {heroHeadlineLine1.map((w, i) => (
                    <motion.span key={i} variants={wordUp} className="mr-[0.25em] inline-block">{w}</motion.span>
                  ))}
                </span>
                <span className="block text-[#7BA68C]">
                  {heroHeadlineLine2.map((w, i) => (
                    <motion.span key={i} variants={wordUp} className="mr-[0.25em] inline-block">{w}</motion.span>
                  ))}
                </span>
              </motion.h1>

              <p className="mb-6 max-w-md text-lg leading-relaxed text-[#2D2D2D]/70">
                A will records the decisions your family may need later — who should care for your children, manage your estate, and receive your property. EzWill helps you organize those instructions for review by your Ontario legal team.
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

              {/* Reassurance micro-row — lands last, draws the eye to "No credit card". */}
              <motion.div
                variants={fadeUp}
                transition={{ delay: 0.3 }}
                className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-[#2D2D2D]/55"
              >
                {['No credit card to start', 'Save & resume anytime', 'Lawyer-reviewed before you sign'].map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-[#C9A84C]" />{t}
                  </span>
                ))}
              </motion.div>

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#2D2D2D]/50">
                <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" /><span>Complete at your pace</span></div>
                <div className="flex items-center gap-1.5"><Lock className="h-4 w-4" /><span>Private questionnaire link</span></div>
                <div className="flex items-center gap-1.5"><FileText className="h-4 w-4" /><span>Draft for lawyer review</span></div>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className="relative hidden lg:block">
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                className="relative h-[480px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#EAF1EC] via-[#E3E0DA] to-[#D3DFD6] shadow-2xl shadow-[#1B2A4A]/10"
              >
                {/* Warm placeholder shown until /hero-family.jpg is added — reads as an intentional panel, not an empty box */}
                <motion.div
                  animate={{ y: [0, -14, 0], x: [0, 8, 0] }}
                  transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
                  className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full bg-[#7BA68C]/30 blur-3xl"
                />
                <motion.div
                  animate={{ y: [0, 12, 0], x: [0, -10, 0] }}
                  transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
                  className="pointer-events-none absolute -bottom-24 -left-12 h-64 w-64 rounded-full bg-[#C9A84C]/25 blur-3xl"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
                  <EzWillLogo className="h-16 w-16 opacity-25" />
                  <p className="text-display text-lg font-semibold text-[#1B2A4A]/40">Your legacy, in good hands</p>
                </div>
                <img
                  src="/hero-family.jpg"
                  alt="Family planning their future together"
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1B2A4A]/30 to-transparent" />
                <div className="absolute inset-x-6 bottom-6 rounded-xl bg-white/95 p-4 shadow-lg backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 18 }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7BA68C]/10"
                    >
                      <Check className="h-5 w-5 text-[#7BA68C]" />
                    </motion.div>
                    <div>
                      <p className="text-sm font-semibold text-[#1B2A4A]">Questionnaire saved</p>
                      <p className="text-xs text-[#2D2D2D]/50">Ready for your legal team to review.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Product scope — factual capabilities only; no pre-launch performance claims. */}
      <section className="border-y border-[#E8E4DF] bg-white py-12 md:py-16">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger} className="mb-8 text-center">
            <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">How EzWill is designed</motion.p>
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="mx-auto mt-3 h-0.5 w-16 origin-left rounded-full bg-[#C9A84C]"
            />
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={{ visible: { transition: { staggerChildren: 0.12 } } }} className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { icon: ScrollText, title: 'Guided intake', label: 'Organize family, asset, and decision-maker information in one place.' },
              { icon: ShieldCheck, title: 'Lawyer workspace', label: 'The legal team can review answers, flags, and draft clauses.' },
              { icon: FileText, title: 'Draft-only output', label: 'Generated documents remain drafts until a lawyer approves them.' },
              { icon: Users, title: 'Ontario scope', label: 'The questionnaire is designed for Ontario wills and powers of attorney.' },
            ].map((item, i) => (
              <motion.div key={i} variants={fadeUp} className="text-center">
                <item.icon className="mx-auto mb-3 h-7 w-7 text-[#7BA68C]" />
                <p className="text-display text-xl font-bold text-[#1B2A4A]">{item.title}</p>
                <p className="mx-auto mt-2 max-w-[16rem] text-xs leading-relaxed text-[#2D2D2D]/55">{item.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* The Lawyer-Reviewed Difference */}
      <section className="py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Lawyer-Reviewed seal — checkmark draws itself */}
            <motion.div variants={fadeUp} className="flex justify-center">
              <div className="relative flex h-64 w-64 items-center justify-center">
                <svg viewBox="0 0 200 200" className="h-full w-full">
                  <circle cx="100" cy="100" r="92" fill="none" stroke="#C9A84C" strokeWidth="2.5" />
                  <circle cx="100" cy="100" r="80" fill="none" stroke="#7BA68C" strokeWidth="1" strokeDasharray="3 5" />
                  <motion.path
                    d="M64 102 l24 24 l48 -56"
                    fill="none"
                    stroke="#7BA68C"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    /* reduced-motion: duration 0 snaps the check on instantly (no self-draw) */
                    transition={{ duration: reduce ? 0 : 0.9, ease: 'easeInOut', delay: reduce ? 0 : 0.2 }}
                  />
                </svg>
                <div className="absolute inset-x-0 bottom-6 text-center">
                  <span className="text-display text-sm font-bold uppercase tracking-[0.2em] text-[#1B2A4A]/70">Lawyer-Reviewed</span>
                </div>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">The EzWill difference</p>
              <h2 className="text-display mb-4 text-3xl font-bold leading-tight text-[#1B2A4A] md:text-4xl">
                You&apos;re not filling out a template. A real lawyer finishes your will.
              </h2>
              <p className="mb-8 text-lg leading-relaxed text-[#2D2D2D]/65">
                EzWill turns your plain-language answers into a structured file and draft clause selections for the legal team. It is designed to support — not replace — the lawyer&apos;s review of your executor choices, guardianship instructions, estate distribution, and Ontario-specific issues.
              </p>
              <motion.ul variants={stagger} className="space-y-4">
                {[
                  { icon: UserCheck, text: 'The file is prepared for review by the Ontario legal team, not approved by an algorithm.' },
                  { icon: ShieldCheck, text: 'Ontario-specific execution requirements are surfaced for the lawyer to confirm.' },
                  { icon: ScrollText, text: 'The firm explains the signing and witnessing steps that apply to your documents.' },
                ].map((item, i) => (
                  <motion.li key={i} variants={fadeUp} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7BA68C]/10">
                      <item.icon className="h-4 w-4 text-[#7BA68C]" />
                    </span>
                    <span className="text-[15px] leading-relaxed text-[#2D2D2D]/75">{item.text}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-white py-20 md:py-28">
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
              { step: '01', title: 'Answer Questions', desc: 'Simple questions about your life, family, and wishes — like a conversation with a trusted advisor. No credit card. Save and come back with your private link whenever.', time: 'Your pace' },
              { step: '02', title: 'Review Your Plan', desc: 'See a clear summary of every choice, with Ontario-specific alerts surfaced for lawyer review.', time: 'Your review' },
              { step: '03', title: 'Lawyer Drafting', desc: 'Your lawyer reviews the answers, selects clauses, and generates the Will and Powers of Attorney.', time: 'Firm-led' },
              { step: '04', title: 'Sign Properly', desc: 'Get signing instructions for Ontario requirements, including two witnesses and in-person execution.', time: 'Guided' },
            ].map((item, i) => (
              <motion.div key={i} variants={fadeUp} className="group relative">
                <div className="h-full rounded-xl border border-[#E8E4DF] bg-[#FAF8F5] p-6 transition-all duration-300 hover:border-[#C9A84C]/30 hover:shadow-lg hover:shadow-[#C9A84C]/5">
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
          {/* Free-to-here progress line */}
          <div className="mx-auto mt-10 max-w-4xl">
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-0.5 w-full origin-left rounded-full bg-gradient-to-r from-[#7BA68C] to-[#C9A84C]"
            />
            <div className="mt-3 flex items-center justify-between text-xs font-medium">
              {/* darker green/gold than the brand tints so these labels clear WCAG AA on the light bg */}
              <span className="inline-flex items-center gap-1.5 text-[#3E6B54]"><Check className="h-3.5 w-3.5" />Free to here — no credit card</span>
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 1, type: 'spring', stiffness: 240, damping: 18 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#C9A84C]/15 px-3 py-1 text-[#6E5410]"
              >
                <Lock className="h-3.5 w-3.5" />No credit card needed for the questionnaire
              </motion.span>
            </div>
          </div>
        </div>
      </section>

      {/* If you don't write it down, Ontario writes it for you (intestacy) */}
      <section className="py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger} className="mb-14 text-center">
            <motion.p variants={fadeUp} className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">Why it matters</motion.p>
            <motion.h2 variants={fadeUp} className="text-display mx-auto mb-4 max-w-3xl text-3xl font-bold text-[#1B2A4A] md:text-4xl">
              If you don&apos;t write it down, Ontario writes it for you.
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto max-w-2xl text-lg text-[#2D2D2D]/60">
              Without a will, the Succession Law Reform Act has a default plan for everyone. It&apos;s fair on paper — but it can&apos;t know your family, your partner, or which of your sisters you&apos;d trust with your kids.
            </motion.p>
          </motion.div>
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="rounded-xl border border-[#E8E4DF] bg-white p-8"
            >
              <p className="mb-5 text-sm font-semibold uppercase tracking-wider text-[#2D2D2D]/40">Without a will — Ontario&apos;s default</p>
              <ul className="space-y-4">
                {[
                  'A court appoints who manages your estate — it may not be who you’d choose.',
                  'A common-law partner can inherit nothing, no matter how many years you shared.',
                  'If guardians disagree, a judge decides who raises your minor children.',
                  'Your estate is split by a fixed formula, not by what mattered to you.',
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-[#2D2D2D]/60">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A84C]" />{t}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="rounded-xl border-2 border-[#7BA68C]/40 bg-[#7BA68C]/[0.04] p-8"
            >
              <p className="mb-5 text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">With your EzWill</p>
              <motion.ul initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="space-y-4">
                {[
                  'You name the person you trust to carry out your wishes.',
                  'You provide for your partner and family exactly as you intend.',
                  'You name the guardian you’d choose for your children.',
                  'You decide who receives what — in your own words.',
                ].map((t, i) => (
                  <motion.li key={i} variants={fadeUp} className="flex items-start gap-3 text-sm leading-relaxed text-[#2D2D2D]/75">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7BA68C]" />{t}
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
          </div>
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mx-auto mt-10 max-w-2xl text-center text-[#2D2D2D]/60">
            None of this takes a lawyer&apos;s office or a hard conversation you&apos;re not ready for.{' '}
            <Link href={startHref} className="font-semibold text-[#1B2A4A] underline decoration-[#C9A84C] decoration-2 underline-offset-4 hover:text-[#7BA68C]">Start My Will — Free</Link>
          </motion.p>
        </div>
      </section>

      {/* Process summary */}
      <section className="bg-[#1B2A4A] py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mb-16 text-center">
            <motion.h2 variants={fadeUp} className="text-display mb-4 text-3xl font-bold text-white md:text-4xl">Know what happens after you answer.</motion.h2>
            <motion.p variants={fadeUp} className="mx-auto max-w-2xl text-lg text-white/60">
              The questionnaire prepares a structured file for the legal team. It does not replace legal advice, lawyer approval, or the required signing process.
            </motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
            <motion.div variants={fadeUp} className="rounded-xl border border-white/10 bg-white/5 p-8">
              <p className="mb-4 text-sm font-medium uppercase tracking-wider text-white/40">Your questionnaire</p>
              <p className="text-display text-3xl font-bold text-white">Organize your instructions</p>
              <div className="gold-line my-6 opacity-20" />
              <ul className="space-y-3">
                {['Move through one topic at a time', 'Save and return with your private link', 'Review the answers before submitting', 'Send questions or uncertainties to the legal team'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-white/60"><span className="h-1.5 w-1.5 rounded-full bg-[#C9A84C]" />{item}</li>
                ))}
              </ul>
            </motion.div>
            <motion.div variants={fadeUp} className="relative rounded-xl border-2 border-[#C9A84C] bg-white p-8">
              <p className="mb-4 text-sm font-medium uppercase tracking-wider text-[#7BA68C]">Legal-team review</p>
              <p className="text-display text-3xl font-bold text-[#1B2A4A]">Review before delivery</p>
              <div className="gold-line my-6" />
              <ul className="space-y-3">
                {['Check the facts supplied in the intake', 'Review flags and questions that need follow-up', 'Edit the selected clauses when needed', 'Treat generated documents as drafts pending approval'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[#2D2D2D]"><Check className="h-4 w-4 text-[#7BA68C]" />{item}</li>
                ))}
              </ul>
              <Link href={startHref}>
                <Button className={`${navyBtn} mt-6 w-full rounded-lg py-5 text-sm font-semibold`}>{startLabel} — Free</Button>
              </Link>
              <p className="mt-2 text-center text-xs text-[#2D2D2D]/45">Start the questionnaire without a credit card.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Intake topics — factual substitute for pre-launch testimonials. */}
      <section className="py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mb-14 text-center">
            <motion.p variants={fadeUp} className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">What you will organize</motion.p>
            <motion.h2 variants={fadeUp} className="text-display text-3xl font-bold text-[#1B2A4A] md:text-4xl">The facts your legal team needs.</motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger} className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {[
              { icon: Users, title: 'Family and decision-makers', text: 'Record your spouse, children, executors, guardians, and attorneys, including backup choices.' },
              { icon: ScrollText, title: 'Assets and obligations', text: 'Give the legal team a structured picture of property, accounts, businesses, debts, and special circumstances.' },
              { icon: FileText, title: 'Gifts and final wishes', text: 'Describe specific gifts, residue beneficiaries, funeral wishes, and questions that need legal advice.' },
            ].map((topic, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                whileHover={{ y: -3 }}
                className="flex flex-col rounded-xl border border-[#E8E4DF] bg-white p-7 shadow-sm"
              >
                <topic.icon className="mb-5 h-8 w-8 text-[#C9A84C]" />
                <h3 className="mb-3 text-lg font-semibold text-[#1B2A4A]">{topic.title}</h3>
                <p className="flex-1 text-[15px] leading-relaxed text-[#2D2D2D]/70">{topic.text}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Our Promise — risk-reversal band. Deep green #3E6B54 (not sage #7BA68C) so
          white body text clears WCAG AA (~6:1; pure white on #7BA68C is only 2.74:1). */}
      <section className="bg-[#3E6B54] py-16 md:py-20">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto max-w-3xl text-center text-white">
            <motion.div variants={fadeUp} className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-white/15">
              <ShieldCheck className="h-7 w-7 text-white" />
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-display mb-4 text-3xl font-bold md:text-4xl">Start with the facts.</motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mb-7 max-w-2xl text-lg leading-relaxed text-white">
              Complete the questionnaire at your own pace and return with your private link. Your answers help the legal team understand your circumstances; they do not create a final will or replace advice about what your plan should contain.
            </motion.p>
            <motion.div variants={fadeUp} className="mb-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-white">
              {['No card required for intake', 'Save and return later', 'Draft-only legal output', 'Lawyer review required'].map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" />{c}</span>
              ))}
            </motion.div>
            <motion.div variants={fadeUp}>
              <Link href={startHref}>
                <motion.span
                  initial={{ boxShadow: '0 0 0 0 rgba(255,255,255,0)' }}
                  /* reduced-motion: skip the ring-pulse entirely (boxShadow is not a positional key) */
                  whileInView={reduce ? undefined : { boxShadow: ['0 0 0 0 rgba(255,255,255,0)', '0 0 0 8px rgba(255,255,255,0.25)', '0 0 0 0 rgba(255,255,255,0)'] }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: 0.4 }}
                  className="inline-block rounded-lg"
                >
                  <Button size="xl" className="rounded-lg bg-white px-10 text-base font-semibold text-[#1B2A4A] shadow-lg transition-transform duration-150 hover:scale-[1.02] hover:bg-white active:scale-[0.97] focus-visible:ring-[#1B2A4A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#3E6B54]">
                    {startLabel} — Free
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </motion.span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mb-6 text-center">
            <motion.p variants={fadeUp} className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">Plans</motion.p>
            <motion.h2 variants={fadeUp} className="text-display mb-4 text-3xl font-bold text-[#1B2A4A] md:text-4xl">Choose the protection that fits your family</motion.h2>
            <motion.p variants={fadeUp} className="mx-auto max-w-2xl text-[15px] leading-relaxed text-[#2D2D2D]/60">
              These packages describe the intended service scope. Confirm the package, fee, and engagement terms with the firm before relying on them.
            </motion.p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto mt-10 grid max-w-5xl gap-8 md:grid-cols-3">
            {[
              { name: 'Essential', price: '$499', desc: 'For individuals with straightforward wishes', features: ['Last Will & Testament intake', 'Executor & backup executor', 'Residue instructions', 'Questions prepared for lawyer review', 'Signing requirements discussed by the firm'], highlighted: false },
              { name: 'Complete', price: '$699', desc: 'For individual will and POA planning', features: ['Everything in Essential', 'Power of Attorney (Property) intake', 'Power of Attorney (Personal Care) intake', 'Personal-care wishes and restrictions', 'One structured file for legal review'], highlighted: true },
              { name: 'Couples', price: '$899', desc: 'For couples planning together', features: ['Two individual intake files', 'Coordinated family information', 'Shared asset questions', 'Separate executor and attorney choices', 'Legal review required for each person'], highlighted: false },
            ].map((plan, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className={`rounded-xl p-8 transition-shadow ${plan.highlighted ? 'relative border border-[#C9A84C] shadow-lg shadow-[#C9A84C]/10 hover:shadow-xl hover:shadow-[#C9A84C]/20' : 'border border-[#E8E4DF] bg-white hover:border-[#C9A84C]/40 hover:shadow-lg hover:shadow-[#C9A84C]/10'}`}
              >
                {plan.highlighted && (
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#C9A84C] px-3 py-1 text-xs font-semibold text-white"
                  >
                    Complete package
                  </motion.div>
                )}
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
                <p className="mt-2 text-center text-xs text-[#2D2D2D]/45">No card required for the questionnaire</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Meet Your Ontario Lawyers */}
      <section id="about" className="bg-white py-20 md:py-28">
        <div className="ezw-container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mb-16 text-center">
            <motion.p variants={fadeUp} className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#7BA68C]">The people responsible</motion.p>
            <motion.h2 variants={fadeUp} className="text-display mb-4 text-3xl font-bold text-[#1B2A4A] md:text-4xl">The lawyers who stand behind your will</motion.h2>
            <motion.p variants={fadeUp} className="mx-auto max-w-2xl text-lg text-[#2D2D2D]/60">
              EzWill was built by the legal team at Vaturi &amp; Cho LLP — Ontario estate lawyers who believe everyone deserves access to proper estate planning.
            </motion.p>
          </motion.div>
          {/* ⚠ PRE-LAUNCH: add real LSO membership numbers + headshots before launch. */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
            {[
              { name: 'James H. Cho', role: 'Estate Lawyer, Vaturi & Cho LLP', cred: 'Licensed by the Law Society of Ontario', exp: 'Wills, estates & powers of attorney' },
              { name: 'Sarah Vaturi', role: 'Senior Counsel', cred: 'Member, Law Society of Ontario', exp: 'Wills, trusts & estate administration' },
              { name: 'Estate Review Team', role: 'Licensed Ontario lawyers', cred: 'Every EzWill document is prepared under lawyer supervision', exp: '' },
            ].map((lawyer, i) => (
              <motion.div key={i} variants={fadeUp} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="rounded-xl border border-[#E8E4DF] bg-[#FAF8F5] p-6 text-center transition-shadow hover:shadow-lg hover:shadow-[#C9A84C]/10">
                <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-[#1B2A4A]/5 ring-2 ring-transparent transition-all hover:ring-[#7BA68C]/40">
                  <Users className="h-10 w-10 text-[#1B2A4A]/30" />
                </div>
                <h3 className="text-base font-semibold text-[#1B2A4A]">{lawyer.name}</h3>
                <p className="text-sm font-medium text-[#7BA68C]">{lawyer.role}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#2D2D2D]/55"><ShieldCheck className="h-3.5 w-3.5 text-[#7BA68C]" />{lawyer.cred}</p>
                {lawyer.exp && <p className="mt-1 text-xs text-[#2D2D2D]/50">{lawyer.exp}</p>}
              </motion.div>
            ))}
          </motion.div>
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mt-10 text-center text-sm text-[#2D2D2D]/55">
            Vaturi &amp; Cho LLP is a law firm licensed to practise in Ontario.{' '}
            <a href="https://lso.ca/public-resources/finding-a-lawyer-or-paralegal/lawyer-and-paralegal-directory" target="_blank" rel="noopener noreferrer" className="group relative font-semibold text-[#1B2A4A] hover:text-[#7BA68C]">
              Verify on the LSO Directory →
              <span className="absolute -bottom-0.5 left-0 h-0.5 w-full origin-left scale-x-0 bg-[#C9A84C] transition-transform duration-200 group-hover:scale-x-100" />
            </a>
          </motion.p>
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
              { q: 'Is this legally valid in Ontario?', a: 'EzWill prepares draft Ontario estate-planning documents for lawyer review. Your lawyer must confirm that the documents fit your circumstances and explain the signing and witnessing requirements before you rely on them.' },
              { q: 'Do I need any legal knowledge?', a: "Not at all. We ask you simple questions in plain language about your life, family, and wishes. Our system translates your answers into proper legal structure for your lawyer to finalize." },
              { q: 'Can clients use Korean?', a: 'Yes. The full intake questionnaire is available in English and 한국어 — toggle the language at any time. Your generated legal documents are prepared in English.' },
              { q: 'How long does it take?', a: 'Take the time you need. You can save your progress with your private link and return later, so there is no pressure to finish in one sitting.' },
              { q: 'What if my situation is complicated?', a: 'EzWill is designed for straightforward estate planning, and surfaces Ontario-specific flags for your lawyer. For complex business structures, international assets, or blended-family situations, your lawyer will advise on next steps.' },
              { q: 'Can the lawyer edit clauses?', a: 'Yes. Your answers assemble a draft in the lawyer clause editor, where the legal team can review and edit the selected clauses before approving a document for client review.' },
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
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: 'url(/hero-abstract.png)', backgroundSize: 'cover', backgroundPosition: 'center', filter: 'invert(1)' }}
        />
        <div className="ezw-container relative text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-display mx-auto mb-4 max-w-3xl text-3xl font-bold text-white md:text-4xl">The best time was years ago. The next best time is tonight.</motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mb-8 max-w-xl text-lg text-white/60">
              Organize the decisions your family may need later, save your work as you go, and give your legal team a clearer file to review.
            </motion.p>
            <motion.div variants={fadeUp}>
              <Link href={startHref}>
                {/* shimmer lives INSIDE the button so overflow-hidden clips the sweep but
                    NOT the button's own focus-ring box-shadow; white ring is visible on navy */}
                <Button size="xl" className="relative overflow-hidden rounded-lg bg-[#C9A84C] px-10 text-base font-semibold text-white shadow-lg shadow-[#C9A84C]/20 transition-transform duration-150 hover:scale-[1.02] hover:bg-[#b8973f] active:scale-[0.97] focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1B2A4A]">
                  {startLabel} — Free
                  <ChevronRight className="ml-2 h-5 w-5" />
                  <motion.span
                    aria-hidden
                    initial={{ x: '-150%' }}
                    whileInView={{ x: '250%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.4 }}
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/3 skew-x-[-20deg] bg-white/25"
                  />
                </Button>
              </Link>
            </motion.div>
            <motion.p variants={fadeUp} className="mt-5 text-sm text-white/45">No credit card required for the questionnaire</motion.p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#1B2A4A] py-12 text-white">
        <div className="ezw-container">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="mb-4 flex items-center gap-2 text-white">
                <EzWillLogo className="h-8 w-8" invert />
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

      {/* Sticky mini-CTA — appears after the hero scrolls out */}
      <AnimatePresence>
        {showSticky && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8E4DF] bg-white/95 shadow-[0_-4px_20px_rgba(27,42,74,0.08)] backdrop-blur-xl"
          >
            <div className="ezw-container flex items-center justify-between gap-4 py-3">
              <p className="hidden text-sm font-medium text-[#1B2A4A] sm:block">
                Ready when you are — start free and save as you go.
              </p>
              <div className="flex flex-1 items-center justify-end gap-2">
                <Link href={startHref} className="flex-1 sm:flex-none">
                  <Button className={`${navyBtn} w-full rounded-lg px-6 py-2.5 text-sm font-semibold sm:w-auto`}>
                    {startLabel} — Free
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
                <button
                  aria-label="Dismiss"
                  onClick={() => setStickyDismissed(true)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#2D2D2D]/40 transition-colors hover:bg-[#1B2A4A]/5 hover:text-[#2D2D2D]/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAF8F5]" />}>
      <HomePageInner />
    </Suspense>
  )
}
