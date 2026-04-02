'use client'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/providers/i18n-provider'

interface StepNavigationProps {
  onBack?: () => void
  onContinue?: () => void
  continueDisabled?: boolean
  continueLabel?: string
  backLabel?: string
  isLastStep?: boolean
  showSkip?: boolean
  onSkip?: () => void
}

export function StepNavigation({
  onBack,
  onContinue,
  continueDisabled,
  continueLabel,
  backLabel,
  isLastStep,
  showSkip,
  onSkip,
}: StepNavigationProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
      <div>
        {onBack ? (
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {backLabel ?? t.back}
          </Button>
        ) : <div />}
      </div>
      <div className="flex items-center gap-3">
        {showSkip && onSkip && (
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-gray-400">
            {t.skip}
          </Button>
        )}
        {onContinue && (
          <Button onClick={onContinue} disabled={continueDisabled} size="lg" className="gap-2">
            {continueLabel ?? (isLastStep ? t.reviewWill : t.continue)}
            {!isLastStep && <ArrowRight className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  )
}
