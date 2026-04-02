'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { AiFlagsSummary } from '@/components/dashboard/ai-flags-summary'
import { getDraft } from '@/lib/api/drafts'

const SECTION_LABELS = [
  { key: 'about_you', label: 'About You' },
  { key: 'your_family', label: 'Family' },
  { key: 'your_estate', label: 'Estate' },
  { key: 'your_arrangements', label: 'Arrangements' },
  { key: 'poa_property', label: 'POA — Property' },
  { key: 'poa_personal_care', label: 'POA — Personal Care' },
  { key: 'assets', label: 'Assets' },
]

function SectionData({ label, data }: { label: string; data: unknown }) {
  if (!data || (typeof data === 'object' && Object.keys(data as object).length === 0)) {
    return (
      <div>
        <h4 className="text-sm font-medium text-gray-500">{label}</h4>
        <p className="mt-1 text-sm text-gray-300 italic">Not started</p>
      </div>
    )
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <div>
          <h4 className="text-sm font-medium text-gray-500">{label}</h4>
          <p className="mt-1 text-sm text-gray-300 italic">None added</p>
        </div>
      )
    }
    return (
      <div>
        <h4 className="text-sm font-medium text-gray-500">{label}</h4>
        <div className="mt-1 space-y-1">
          {data.map((item, idx) => (
            <div key={idx} className="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {typeof item === 'object' ? JSON.stringify(item, null, 0).slice(0, 200) : String(item)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const obj = data as Record<string, unknown>
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-500">{label}</h4>
      <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1">
        {Object.entries(obj).map(([key, val]) => {
          if (val === null || val === undefined || val === '') return null
          if (typeof val === 'object') return null // skip nested objects in summary
          return (
            <div key={key} className="flex items-baseline gap-2 text-sm">
              <span className="text-gray-400">{key.replace(/_/g, ' ')}:</span>
              <span className="text-gray-700">{String(val)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface DraftDetail {
  id: string
  client_first_name: string
  client_last_name: string
  client_email: string | null
  client_phone: string | null
  status: string
  language: string
  current_step: number
  completed_steps: number[]
  submitted_at: string | null
  updated_at: string
  created_at: string
  about_you?: Record<string, unknown>
  your_family?: Record<string, unknown>
  your_estate?: Record<string, unknown>
  your_arrangements?: Record<string, unknown>
  poa_property?: Record<string, unknown>
  poa_personal_care?: Record<string, unknown>
  assets?: unknown[]
  people?: unknown[]
  ai_flags?: Array<{
    id: string
    severity: string
    title: string
    description: string
    statute?: string
    dismissed?: boolean
  }>
  tier2_clauses?: Record<string, unknown> | null
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [draft, setDraft] = useState<DraftDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDraft(id)
      .then((res) => {
        if (!res) {
          setError('Draft not found')
          return
        }
        setDraft(res as unknown as DraftDetail)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Clients
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || 'Draft not found'}
        </div>
      </div>
    )
  }

  const progress = Math.round((draft.completed_steps.length / 7) * 100)

  // Map ai_flags to the format AiFlagsSummary expects
  const flags = (draft.ai_flags ?? [])
    .filter((f) => !f.dismissed)
    .map((f) => ({
      id: f.id,
      rule: f.title,
      severity: f.severity as 'warning' | 'critical',
      message: f.description,
      field: f.statute,
    }))

  // Build section data map
  const sectionData: Record<string, unknown> = {
    about_you: draft.about_you,
    your_family: draft.your_family,
    your_estate: draft.your_estate,
    your_arrangements: draft.your_arrangements,
    poa_property: draft.poa_property,
    poa_personal_care: draft.poa_personal_care,
    assets: draft.assets,
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Clients
      </Link>

      {/* Client Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {draft.client_first_name} {draft.client_last_name}
          </h2>
          <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
            {draft.client_email && <span>{draft.client_email}</span>}
            {draft.client_phone && <span>{draft.client_phone}</span>}
            <Badge variant="secondary" className="uppercase text-xs">{draft.language}</Badge>
          </div>
        </div>
        <StatusBadge status={draft.status} />
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Intake Progress</span>
            <span className="text-gray-500">{progress}% — Step {draft.current_step + 1} of 7</span>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-400">
            {SECTION_LABELS.map((s, i) => (
              <span
                key={s.key}
                className={draft.completed_steps.includes(i) ? 'text-amber-600 font-medium' : ''}
              >
                {s.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Link href={`/dashboard/clients/${id}/design-sheet`}>
          <Button variant="outline">
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Design Sheet
          </Button>
        </Link>
        <Link href={`/dashboard/clients/${id}/tier2`}>
          <Button variant="outline">
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configure Tier 2
          </Button>
        </Link>
        <Link href={`/dashboard/clients/${id}/documents`}>
          <Button>
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Generate Documents
          </Button>
        </Link>
      </div>

      {/* AI Flags */}
      <AiFlagsSummary flags={flags} />

      {/* Timestamps */}
      <div className="flex gap-6 text-xs text-gray-400">
        <span>Created: {new Date(draft.created_at).toLocaleDateString('en-CA')}</span>
        <span>Updated: {new Date(draft.updated_at).toLocaleDateString('en-CA')}</span>
        {draft.submitted_at && <span>Submitted: {new Date(draft.submitted_at).toLocaleDateString('en-CA')}</span>}
      </div>

      <Separator />

      {/* Section Answers */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Client Answers</h3>
        <div className="space-y-6">
          {SECTION_LABELS.map((section) => (
            <Card key={section.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{section.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <SectionData label="" data={sectionData[section.key]} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
