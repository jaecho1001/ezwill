'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import { useDraftSync } from '@/hooks/use-draft-sync'
import { WILL_STEPS } from '@/lib/constants/steps'
import { BrandLockup } from '@/components/ui/brand'
import { LanguageToggle } from './language-toggle'

export function WizardShell({ children }: { children: React.ReactNode }) {
  const { will } = useWillForm()
  const { t } = useTranslation()
  const pathname = usePathname()

  // Auto-sync draft to server (debounced 1.5s). No-op if no draftId in context.
  useDraftSync()

  const progressPct = ((will.completedSteps.length) / WILL_STEPS.length) * 100

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#2D2D2D]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-[#E8E4DF] bg-[#FAF8F5]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <BrandLockup />
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageToggle />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-[#2D2D2D]/60 transition-colors hover:text-[#1B2A4A]"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Save &amp; Exit</span>
            </Link>
          </div>
        </div>

        {/* Step tabs — horizontal scroll on mobile */}
        <div className="overflow-x-auto border-t border-[#E8E4DF]/60">
          <div className="mx-auto max-w-5xl px-4">
            <div className="flex min-w-max gap-0">
              {WILL_STEPS.map((step, i) => {
                const isComplete = will.completedSteps.includes(step.id)
                const isCurrent = pathname.includes(step.key)
                const isAccessible = i === 0 || will.completedSteps.includes(WILL_STEPS[i - 1].id) || isCurrent
                return (
                  <Link
                    key={step.id}
                    href={isAccessible ? step.path : '#'}
                    className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-medium transition-all ${
                      isCurrent
                        ? 'border-[#1B2A4A] text-[#1B2A4A]'
                        : isComplete
                        ? 'border-[#7BA68C] text-[#7BA68C]'
                        : isAccessible
                        ? 'border-transparent text-[#2D2D2D]/50 hover:border-[#E8E4DF] hover:text-[#1B2A4A]'
                        : 'cursor-not-allowed border-transparent text-[#2D2D2D]/25'
                    }`}
                  >
                    <span>{step.icon}</span>
                    <span className="hidden md:block">{step.title}</span>
                    <span className="md:hidden">{step.id}</span>
                    {isComplete && <Check className="h-3 w-3 text-[#7BA68C]" />}
                  </Link>
                )
              })}
              <Link
                href="/will/review"
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-medium transition-all ${
                  pathname.includes('review')
                    ? 'border-[#1B2A4A] text-[#1B2A4A]'
                    : will.completedSteps.length === WILL_STEPS.length
                    ? 'border-transparent text-[#2D2D2D]/50 hover:text-[#1B2A4A]'
                    : 'cursor-not-allowed border-transparent text-[#2D2D2D]/25'
                }`}
              >
                📄 <span className="hidden md:block">{t.reviewWill}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-[#E8E4DF]">
          <div
            className="h-full bg-[#1B2A4A] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-2xl px-4 py-10 md:py-14">
        {children}
      </main>
    </div>
  )
}
