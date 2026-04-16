'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import { useDraftSync } from '@/hooks/use-draft-sync'
import { WILL_STEPS } from '@/lib/constants/steps'
import { Progress } from '@/components/ui/progress'
import { LanguageToggle } from './language-toggle'

export function WizardShell({ children }: { children: React.ReactNode }) {
  const { will } = useWillForm()
  const { t } = useTranslation()
  const pathname = usePathname()

  // Auto-sync draft to server (debounced 1.5s). No-op if no draftId in context.
  useDraftSync()

  const currentStepConfig = WILL_STEPS.find(s => pathname.includes(s.key))
  const currentStepIndex = currentStepConfig ? WILL_STEPS.indexOf(currentStepConfig) : 0
  const progressPct = ((will.completedSteps.length) / WILL_STEPS.length) * 100

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-amber-500">EZWill</span>
            <span className="text-xs text-gray-400 hidden sm:block">Ontario</span>
          </Link>
          <div className="flex-1 max-w-xs hidden sm:block">
            <Progress value={progressPct} className="h-1.5" />
          </div>
          <LanguageToggle />
        </div>
      </header>

      {/* Step tabs — horizontal scroll on mobile */}
      <div className="bg-white border-b border-gray-200 overflow-x-auto">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-0 min-w-max">
            {WILL_STEPS.map((step, i) => {
              const isComplete = will.completedSteps.includes(step.id)
              const isCurrent = pathname.includes(step.key)
              const isAccessible = i === 0 || will.completedSteps.includes(WILL_STEPS[i - 1].id) || isCurrent
              return (
                <Link
                  key={step.id}
                  href={isAccessible ? step.path : '#'}
                  className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                    isCurrent
                      ? 'border-amber-500 text-amber-700'
                      : isComplete
                      ? 'border-green-500 text-green-700'
                      : isAccessible
                      ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      : 'border-transparent text-gray-300 cursor-not-allowed'
                  }`}
                >
                  <span>{step.icon}</span>
                  <span className="hidden md:block">{step.title}</span>
                  <span className="md:hidden">{step.id}</span>
                  {isComplete && <Check className="h-3 w-3 text-green-500" />}
                </Link>
              )
            })}
            <Link
              href="/will/review"
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                pathname.includes('review')
                  ? 'border-amber-500 text-amber-700'
                  : will.completedSteps.length === WILL_STEPS.length
                  ? 'border-transparent text-gray-500 hover:text-gray-700'
                  : 'border-transparent text-gray-300 cursor-not-allowed'
              }`}
            >
              📄 <span className="hidden md:block">{t.reviewWill}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
