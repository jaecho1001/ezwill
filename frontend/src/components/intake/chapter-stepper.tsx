'use client'

import { cn } from '@/lib/utils'
import type { IntakeChapter } from '@/lib/intake/will-intake-script'

interface Props {
  chapters: IntakeChapter[]
  currentIndex: number
  progressByChapter: Record<string, { pct: number; requiredUnanswered: number; asked: number }>
  onSelect: (index: number) => void
}

export function ChapterStepper({ chapters, currentIndex, progressByChapter, onSelect }: Props) {
  return (
    <ol className="flex flex-col gap-1">
      {chapters.map((ch, i) => {
        const p = progressByChapter[ch.id]
        const isCurrent = i === currentIndex
        const isComplete = p && p.pct === 100 && p.requiredUnanswered === 0
        return (
          <li key={ch.id}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                isCurrent ? 'bg-amber-50 text-amber-900' : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <span className="text-lg leading-none">{ch.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{ch.title}</span>
                  {isComplete ? (
                    <span className="shrink-0 text-xs text-green-600">✓</span>
                  ) : p ? (
                    <span className="shrink-0 text-[10px] text-gray-400">{p.pct}%</span>
                  ) : null}
                </div>
                {p && p.asked !== undefined && p.pct < 100 && (
                  <div className="mt-1 h-1 rounded-full bg-gray-100">
                    <div
                      className="h-1 rounded-full bg-amber-400 transition-all"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
