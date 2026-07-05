'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { PeopleRolesGrid } from '@/components/dashboard/people-roles-grid'
import { AssetSummary } from '@/components/dashboard/asset-summary'
import { DistributionChart } from '@/components/dashboard/distribution-chart'
import { determineRequiredDocuments, getDocumentTypeConfig } from '@/lib/will-documents/index'
import { getAuthHeaders } from '@/lib/auth'

// ── Types ────────────────────────────────────────────────────────────

interface DraftWithDetails {
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
  assets?: Array<Record<string, unknown>>
  people?: Array<Record<string, unknown>>
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

interface EstateOverviewProps {
  draft: DraftWithDetails
  onNavigate: (section: string) => void
}

// ── Section Nav Anchors ──────────────────────────────────────────────

const SECTION_IDS = {
  people: 'estate-people',
  assets: 'estate-assets',
  distribution: 'estate-distribution',
  trusts: 'estate-trusts',
  documents: 'estate-documents',
  dates: 'estate-dates',
} as const

// ── Component ────────────────────────────────────────────────────────

export function EstateOverview({ draft, onNavigate }: EstateOverviewProps) {
  const draftRecord = draft as unknown as { id?: string; lawyer_notes?: string }
  const [lawyerNotes, setLawyerNotes] = useState(draftRecord.lawyer_notes ?? '')
  const [notesSaved, setNotesSaved] = useState(false)

  async function saveNotes() {
    if (!draftRecord.id) return
    try {
      const res = await fetch(`/api/drafts/${draftRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ lawyer_notes: lawyerNotes }),
      })
      if (res.ok) {
        setNotesSaved(true)
        setTimeout(() => setNotesSaved(false), 2000)
      }
    } catch {
      // Keep the typed text; the lawyer can retry by editing again.
    }
  }

  const estate = (draft.your_estate ?? {}) as Record<string, unknown>
  const family = (draft.your_family ?? {}) as Record<string, unknown>
  const arrangements = (draft.your_arrangements ?? {}) as Record<string, unknown>
  const poaProp = (draft.poa_property ?? {}) as Record<string, unknown>
  const poaCare = (draft.poa_personal_care ?? {}) as Record<string, unknown>
  const assets = (draft.assets ?? []) as Array<Record<string, unknown>>
  const people = (draft.people ?? []) as Array<Record<string, unknown>>

  const isDualWill = Boolean(estate.includeDualWill)

  // ── Beneficiaries for distribution chart ──
  const beneficiaries = useMemo(() => {
    const bens = (estate.beneficiaries ?? []) as Array<Record<string, unknown>>
    if (bens.length > 0) {
      return bens.map((b, i) => ({
        name: `${String(b.firstName ?? '')} ${String(b.lastName ?? '')}`.trim() || `Beneficiary ${i + 1}`,
        relationship: String(b.relationship ?? ''),
        percentage: typeof b.percentage === 'number' ? b.percentage : Math.floor(100 / bens.length),
      }))
    }
    // Fallback: if residue goes to children, list them
    const residue = estate.residueDistribution as string | undefined
    if ((residue === 'equal_children' || residue === 'per_stirpes') && Array.isArray(family.children)) {
      const children = family.children as Array<Record<string, unknown>>
      if (children.length > 0) {
        const share = Math.floor(100 / children.length)
        return children.map((c, i) => ({
          name: `${String(c.firstName ?? '')} ${String(c.lastName ?? '')}`.trim() || `Child ${i + 1}`,
          relationship: 'child',
          percentage: i === children.length - 1 ? 100 - share * (children.length - 1) : share,
        }))
      }
    }
    return []
  }, [estate.beneficiaries, estate.residueDistribution, family.children])

  // ── Gifts ──
  const gifts = useMemo(() => {
    const raw = (estate.gifts ?? []) as Array<Record<string, unknown>>
    return raw.map((g) => {
      // Try to resolve recipient name
      let recipientName: string | undefined
      if (g.recipientId) {
        const person = people.find((p) => p.id === g.recipientId)
        if (person) {
          recipientName = `${String(person.firstName ?? '')} ${String(person.lastName ?? '')}`.trim()
        }
      }
      return {
        id: String(g.id ?? ''),
        type: String(g.type ?? ''),
        description: String(g.description ?? ''),
        recipientName,
        charityName: g.charityName ? String(g.charityName) : undefined,
        amount: typeof g.amount === 'number' ? g.amount : undefined,
      }
    })
  }, [estate.gifts, people])

  const donations = useMemo(() => {
    const raw = (estate.donations ?? []) as Array<Record<string, unknown>>
    return raw.map((g) => ({
      id: String(g.id ?? ''),
      type: String(g.type ?? 'charity'),
      description: String(g.description ?? ''),
      charityName: g.charityName ? String(g.charityName) : undefined,
      amount: typeof g.amount === 'number' ? g.amount : undefined,
    }))
  }, [estate.donations])

  // ── Trust provisions ──
  const trusts = useMemo(() => {
    if (!estate.hasTrusts || !Array.isArray(estate.trusts)) return []
    return (estate.trusts as Array<Record<string, unknown>>).map((t) => ({
      trustType: String(t.trustType ?? 'childrens'),
      distributionAge: typeof t.distributionAge === 'number' ? t.distributionAge : undefined,
      absoluteDiscretion: Boolean(t.absoluteDiscretion),
      maxVoluntaryPayment: typeof t.maxVoluntaryPayment === 'number' ? t.maxVoluntaryPayment : undefined,
      beneficiaryIds: (t.beneficiaryIds ?? []) as string[],
      trusteeIds: (t.trusteeIds ?? []) as string[],
    }))
  }, [estate.hasTrusts, estate.trusts])

  // ── Required documents ──
  const requiredDocs = useMemo(() => {
    return determineRequiredDocuments({
      tier: isDualWill ? 2 : 1,
      hasDualWill: isDualWill,
      hasPoaProperty: Boolean(poaProp.hasAttorney),
      hasPoaPersonalCare: Boolean(poaCare.hasAttorney),
    })
  }, [isDualWill, poaProp.hasAttorney, poaCare.hasAttorney])

  const TRUST_TYPE_LABELS: Record<string, { label: string; description: string }> = {
    childrens: { label: "Minor Children's Trust", description: 'Holds assets until children reach the specified age' },
    henson: { label: 'Henson Trust', description: 'Protects ODSP eligibility for disabled beneficiaries' },
    spousal: { label: 'Spousal Trust', description: 'Income to spouse, remainder to children on spouse\'s death' },
    gre: { label: 'Graduated Rate Estate', description: 'Tax-advantaged estate administration for first 36 months' },
  }

  return (
    <div className="space-y-8">
      {/* Quick Nav */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: SECTION_IDS.people, label: 'People & Roles' },
          { id: SECTION_IDS.assets, label: 'Assets' },
          { id: SECTION_IDS.distribution, label: 'Distribution' },
          { id: SECTION_IDS.trusts, label: 'Trusts' },
          { id: SECTION_IDS.documents, label: 'Documents' },
          { id: SECTION_IDS.dates, label: 'Dates & Notes' },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ─── Section A: People & Roles ────────────────────────── */}
      <section id={SECTION_IDS.people}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">People & Roles</h3>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('your_arrangements')}>
            Edit
          </Button>
        </div>
        <PeopleRolesGrid draft={draft} onNavigate={onNavigate} />
      </section>

      <Separator />

      {/* ─── Section B: Asset Inventory ───────────────────────── */}
      <section id={SECTION_IDS.assets}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Asset Inventory</h3>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('assets')}>
            Edit
          </Button>
        </div>
        <AssetSummary assets={assets} isDualWill={isDualWill} onNavigate={onNavigate} />
      </section>

      <Separator />

      {/* ─── Section C: Distribution Plan ─────────────────────── */}
      <section id={SECTION_IDS.distribution}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Distribution Plan</h3>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('your_estate')}>
            Edit
          </Button>
        </div>
        <DistributionChart
          beneficiaries={beneficiaries}
          gifts={gifts}
          donations={donations}
          residueDistribution={String(estate.residueDistribution ?? 'per_stirpes')}
          onNavigate={onNavigate}
        />
      </section>

      <Separator />

      {/* ─── Section D: Trust Provisions ──────────────────────── */}
      <section id={SECTION_IDS.trusts}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Trust Provisions</h3>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('your_estate')}>
            Edit
          </Button>
        </div>

        {trusts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {trusts.map((trust, i) => {
              const cfg = TRUST_TYPE_LABELS[trust.trustType]
              return (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {cfg?.label ?? trust.trustType}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-500">{cfg?.description ?? ''}</p>
                    <div className="mt-3 space-y-1.5">
                      {trust.distributionAge && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">Age {trust.distributionAge}</Badge>
                          <span className="text-xs text-gray-500">distribution age</span>
                        </div>
                      )}
                      {trust.absoluteDiscretion && (
                        <Badge variant="info" className="text-[10px]">Absolute Discretion</Badge>
                      )}
                      {trust.maxVoluntaryPayment !== undefined && (
                        <div className="text-xs text-gray-600">
                          Max voluntary payment: {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(trust.maxVoluntaryPayment)}
                        </div>
                      )}
                      {trust.trusteeIds.length > 0 && (
                        <div className="text-xs text-gray-500">
                          {trust.trusteeIds.length} trustee{trust.trusteeIds.length !== 1 ? 's' : ''} assigned
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-gray-400">
                No explicit trust provisions configured. Default minor trust applies at age {Number(estate.minorTrustAge ?? 25)}.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <Separator />

      {/* ─── Section E: Document Status ───────────────────────── */}
      <section id={SECTION_IDS.documents}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Document Status</h3>
          <Button size="sm" onClick={() => onNavigate('documents')}>
            <svg className="mr-1.5 h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Generate All
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {requiredDocs.map((docType) => {
                const cfg = getDocumentTypeConfig(docType)
                // Determine status based on draft completion
                const isSubmitted = Boolean(draft.submitted_at)
                const hasAllSteps = draft.completed_steps.length >= 6
                let status = 'not_started' as string
                if (isSubmitted) {
                  status = 'pending' // submitted but not yet generated
                } else if (hasAllSteps) {
                  status = 'pending'
                }

                return (
                  <div key={docType} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{cfg?.icon ?? '📄'}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{cfg?.shortName ?? docType}</p>
                        <p className="text-xs text-gray-400">{cfg?.name ?? ''}</p>
                      </div>
                    </div>
                    <div>
                      {status === 'generated' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Generated
                        </span>
                      ) : status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                          <svg className="h-4 w-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Ready to Generate
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Not Started
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* ─── Section F: Key Dates & Notes ─────────────────────── */}
      <section id={SECTION_IDS.dates}>
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Key Dates & Notes</h3>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-0">
                {[
                  {
                    label: 'Questionnaire created',
                    date: draft.created_at,
                    done: true,
                  },
                  {
                    label: 'Last updated',
                    date: draft.updated_at,
                    done: true,
                  },
                  {
                    label: 'Client submitted',
                    date: draft.submitted_at,
                    done: Boolean(draft.submitted_at),
                  },
                  {
                    label: 'Lawyer reviewed',
                    date: null,
                    done: draft.status === 'in_review' || draft.status === 'approved' || draft.status === 'signed',
                  },
                  {
                    label: 'Documents signed',
                    date: null,
                    done: draft.status === 'signed',
                  },
                ].map((event, i, arr) => (
                  <div key={i} className="flex gap-3 pb-4">
                    {/* Dot + line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`mt-1 h-3 w-3 rounded-full border-2 ${
                          event.done
                            ? 'border-amber-500 bg-amber-500'
                            : 'border-gray-300 bg-white'
                        }`}
                      />
                      {i < arr.length - 1 && (
                        <div className="mt-1 w-0.5 flex-1 bg-gray-200" />
                      )}
                    </div>
                    {/* Label + date */}
                    <div className="flex-1 pb-1">
                      <p className={`text-sm ${event.done ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                        {event.label}
                      </p>
                      {event.date && (
                        <p className="text-xs text-gray-500">
                          {new Date(event.date).toLocaleDateString('en-CA', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Lawyer Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Lawyer Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Add internal notes about this estate plan..."
                value={lawyerNotes}
                onChange={(e) => setLawyerNotes(e.target.value)}
                onBlur={saveNotes}
                rows={8}
                className="resize-none text-sm"
              />
              <p className="mt-2 text-xs text-gray-400">
                {notesSaved ? 'Saved.' : 'Notes save automatically when you click away. Not visible to the client.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
