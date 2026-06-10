'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { WillVault } from '@/types/will-vault'
import { willIntakeChapters, chapterProgress } from '@/lib/intake/will-intake-script'
import { cn } from '@/lib/utils'

interface Props {
  willId: string
  vault: WillVault
}

/**
 * Collapsible "facts" panel that sits above the clause library tree. Shows
 * one row per chapter with its completion %, and lets the user jump into
 * the intake wizard to fill gaps without losing their place in the editor.
 */
export function FactsPanel({ willId, vault }: Props) {
  const [open, setOpen] = useState(false)
  const summary = willIntakeChapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    icon: ch.icon,
    pct: chapterProgress(ch, vault).pct,
    requiredUnanswered: chapterProgress(ch, vault).requiredUnanswered,
    index: willIntakeChapters.indexOf(ch),
  }))
  const avgPct = Math.round(summary.reduce((s, c) => s + c.pct, 0) / summary.length)
  const anyMissing = summary.some((c) => c.requiredUnanswered > 0)

  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-100"
      >
        <span>📋</span>
        <span>Facts</span>
        <span
          className={cn(
            'ml-1 rounded-full px-1.5 py-0.5 text-[10px]',
            anyMissing ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'
          )}
        >
          {avgPct}%
        </span>
        <span className="ml-auto text-[10px] text-gray-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="space-y-1 px-3 pb-2">
          {summary.map((s) => (
            <Link
              key={s.id}
              href={`/intake/${willId}?chapter=${s.index}`}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-white"
            >
              <span>{s.icon}</span>
              <span className="truncate text-gray-700">{s.title}</span>
              <span
                className={cn(
                  'ml-auto text-[10px]',
                  s.requiredUnanswered > 0 ? 'text-amber-700' : 'text-gray-400'
                )}
              >
                {s.pct}%
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
