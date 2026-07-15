'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface AIFlag {
  id: string
  rule: string
  severity: 'warning' | 'critical'
  message: string
  field?: string
}

interface AiFlagsSummaryProps {
  flags: AIFlag[]
}

export function AiFlagsSummary({ flags }: AiFlagsSummaryProps) {
  const [isOpen, setIsOpen] = useState(false)

  const critical = flags.filter((f) => f.severity === 'critical')
  const warnings = flags.filter((f) => f.severity === 'warning')

  if (flags.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2 text-sm text-green-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          No AI flags — all checks passed
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-[#C9A84C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="text-sm font-medium text-gray-900">
            AI Flags ({flags.length})
          </span>
          <div className="flex gap-1.5">
            {critical.length > 0 && (
              <Badge variant="destructive">{critical.length} critical</Badge>
            )}
            {warnings.length > 0 && (
              <Badge variant="warning">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</Badge>
            )}
          </div>
        </div>
        <svg
          className={cn('h-4 w-4 text-gray-400 transition-transform', isOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          {critical.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-red-600">Critical</h4>
              {critical.map((flag) => (
                <div key={flag.id} className="rounded-md border border-red-200 bg-red-50 p-3">
                  <div className="flex items-start gap-2">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-red-800">{flag.rule}</p>
                      <p className="mt-0.5 text-sm text-red-700">{flag.message}</p>
                      {flag.field && (
                        <p className="mt-1 text-xs text-red-500">Field: {flag.field}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8a6a1e]">Warnings</h4>
              {warnings.map((flag) => (
                <div key={flag.id} className="rounded-md border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-3">
                  <div className="flex items-start gap-2">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A84C]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-[#8a6a1e]">{flag.rule}</p>
                      <p className="mt-0.5 text-sm text-[#8a6a1e]">{flag.message}</p>
                      {flag.field && (
                        <p className="mt-1 text-xs text-[#8a6a1e]/70">Field: {flag.field}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
