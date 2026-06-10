'use client'

import { cn } from '@/lib/utils'

interface Props {
  title: string
  icon: string
  completenessPct: number
  onJumpToIntake?: () => void
  children: React.ReactNode
}

export function EditableReviewSection({ title, icon, completenessPct, onJumpToIntake, children }: Props) {
  const isComplete = completenessPct === 100
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <span className="text-xl leading-none">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium',
            isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700'
          )}
        >
          {isComplete ? '✓ Complete' : `${completenessPct}%`}
        </span>
        {onJumpToIntake && (
          <button
            type="button"
            onClick={onJumpToIntake}
            className="text-[11px] text-gray-400 hover:text-amber-700"
            title="Open this chapter in intake"
          >
            Open wizard →
          </button>
        )}
      </header>
      <dl className="divide-y divide-gray-50">{children}</dl>
    </section>
  )
}
