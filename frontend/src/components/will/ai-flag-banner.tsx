'use client'
import { AlertTriangle, Info, X } from 'lucide-react'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import type { AIFlag } from '@/lib/types/will'

function FlagIcon({ severity }: { severity: AIFlag['severity'] }) {
  if (severity === 'critical') return <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
  return <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
}

function flagBg(severity: AIFlag['severity']) {
  if (severity === 'critical') return 'bg-red-50 border-red-200'
  if (severity === 'warning') return 'bg-amber-50 border-amber-200'
  return 'bg-blue-50 border-blue-200'
}

export function AIFlagBanner() {
  const { will, dispatch } = useWillForm()
  const { lang } = useTranslation()

  const activeFlags = will.aiFlags.filter(f => !f.dismissed)
  if (activeFlags.length === 0) return null

  return (
    <div className="space-y-2 mb-6">
      {activeFlags.map(flag => (
        <div key={flag.id} className={`flex gap-3 rounded-xl border p-4 ${flagBg(flag.severity)}`}>
          <FlagIcon severity={flag.severity} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {lang === 'ko' && flag.titleKo ? flag.titleKo : flag.title}
            </p>
            <p className="mt-0.5 text-xs text-gray-600 leading-relaxed">
              {lang === 'ko' && flag.descriptionKo ? flag.descriptionKo : flag.description}
            </p>
            {flag.statute && (
              <p className="mt-1 text-xs text-gray-400 font-mono">{flag.statute}</p>
            )}
          </div>
          <button
            onClick={() => dispatch({ type: 'DISMISS_FLAG', payload: flag.id })}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
