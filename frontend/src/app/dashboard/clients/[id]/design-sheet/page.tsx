'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getDraft } from '@/lib/api/drafts'

interface DraftDetail {
  id: string
  client_first_name: string
  client_last_name: string
  status: string
  language: string
  about_you?: Record<string, unknown>
  your_family?: Record<string, unknown>
  your_estate?: Record<string, unknown>
  your_arrangements?: Record<string, unknown>
  poa_property?: Record<string, unknown>
  poa_personal_care?: Record<string, unknown>
  assets?: Array<Record<string, unknown>>
  people?: Array<Record<string, unknown>>
}

interface BeneficiaryRow {
  name: string
  relationship: string
  percentage: number
}

export default function DesignSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [draft, setDraft] = useState<DraftDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [willType, setWillType] = useState<'single' | 'dual'>('single')
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRow[]>([])
  const [editingBeneficiaries, setEditingBeneficiaries] = useState(false)

  useEffect(() => {
    getDraft(id)
      .then((res) => {
        if (!res) {
          setError('Draft not found')
          return
        }
        const d = res as unknown as DraftDetail
        setDraft(d)

        // Determine will type from estate data
        const estate = d.your_estate as Record<string, unknown> | undefined
        if (estate?.includeDualWill) {
          setWillType('dual')
        }

        // Extract beneficiaries from people array or estate data
        const people = (d.people ?? []) as Array<Record<string, unknown>>
        const beneficiaryPeople = people.filter(
          (p) => p.role === 'beneficiary' || p.role === 'child'
        )

        if (beneficiaryPeople.length > 0) {
          const evenSplit = Math.floor(100 / beneficiaryPeople.length)
          setBeneficiaries(
            beneficiaryPeople.map((p, i) => ({
              name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || `Beneficiary ${i + 1}`,
              relationship: (p.relationship as string) ?? (p.role as string) ?? '',
              percentage: (p.percentage as number) ?? evenSplit,
            }))
          )
        } else {
          // Default placeholder
          setBeneficiaries([
            { name: 'Spouse', relationship: 'spouse', percentage: 100 },
          ])
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B2A4A] border-t-transparent" />
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="space-y-4">
        <Link href={`/dashboard/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Client
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error ?? 'Not found'}</div>
      </div>
    )
  }

  const aboutYou = (draft.about_you ?? {}) as Record<string, unknown>
  const family = (draft.your_family ?? {}) as Record<string, unknown>
  const estate = (draft.your_estate ?? {}) as Record<string, unknown>
  const arrangements = (draft.your_arrangements ?? {}) as Record<string, unknown>
  const poaProp = (draft.poa_property ?? {}) as Record<string, unknown>
  const poaCare = (draft.poa_personal_care ?? {}) as Record<string, unknown>
  const assets = (draft.assets ?? []) as Array<Record<string, unknown>>

  const totalPercentage = beneficiaries.reduce((sum, b) => sum + b.percentage, 0)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href={`/dashboard/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Client
      </Link>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">Design Sheet</h2>
        <p className="mt-1 text-sm text-gray-500">
          Planning summary for {draft.client_first_name} {draft.client_last_name}&apos;s estate documents.
        </p>
      </div>

      {/* Will Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Will Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <button
              onClick={() => setWillType('single')}
              className={`flex-1 rounded-lg border-2 p-4 text-left transition-colors ${
                willType === 'single'
                  ? 'border-[#1B2A4A] bg-[#1B2A4A]/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-medium text-gray-900">Single Will</p>
              <p className="mt-1 text-sm text-gray-500">Standard last will and testament covering all assets.</p>
            </button>
            <button
              onClick={() => setWillType('dual')}
              className={`flex-1 rounded-lg border-2 p-4 text-left transition-colors ${
                willType === 'dual'
                  ? 'border-[#1B2A4A] bg-[#1B2A4A]/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-medium text-gray-900">Dual Will</p>
              <p className="mt-1 text-sm text-gray-500">Primary (Probate) + Secondary (Non-Probate) for EAT savings.</p>
              {assets.some((a) => a.assetType === 'business') && (
                <Badge variant="warning" className="mt-2">Recommended — has business assets</Badge>
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Estate Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estate Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Testator</h4>
              <p className="text-sm text-gray-900">
                {String(aboutYou.legalFirstName ?? draft.client_first_name)} {String(aboutYou.legalLastName ?? draft.client_last_name)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {aboutYou.city ? `${String(aboutYou.city)}, ` : ''}{String(aboutYou.province ?? 'ON')}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Marital Status</h4>
              <p className="text-sm text-gray-900 capitalize">{String(family.maritalStatus ?? 'Not specified')}</p>
              {family.hasChildren ? (
                <p className="text-xs text-gray-500 mt-1">
                  {(Array.isArray(family.children) ? family.children : []).length} child(ren)
                </p>
              ) : null}
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Assets</h4>
              <p className="text-sm text-gray-900">{assets.length} asset(s) declared</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {[...new Set(assets.map((a) => String(a.assetType)))].map((type) => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Key Provisions</h4>
              <div className="space-y-1 text-sm">
                {estate.includeFLAExclusion ? <p className="text-green-600">FLA Exclusion included</p> : null}
                {estate.includeGREClause ? <p className="text-green-600">GRE clause included</p> : null}
                {estate.hasTrusts ? <p className="text-[#8a6a1e]">Has trust provisions</p> : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Beneficiary Distribution */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Beneficiary Distribution</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingBeneficiaries(!editingBeneficiaries)}
          >
            {editingBeneficiaries ? 'Done' : 'Edit'}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {beneficiaries.map((b, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="flex-1">
                  {editingBeneficiaries ? (
                    <Input
                      value={b.name}
                      onChange={(e) => {
                        const next = [...beneficiaries]
                        next[i] = { ...next[i], name: e.target.value }
                        setBeneficiaries(next)
                      }}
                    />
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-gray-900">{b.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{b.relationship}</p>
                    </div>
                  )}
                </div>
                <div className="w-32">
                  {editingBeneficiaries ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={b.percentage}
                        onChange={(e) => {
                          const next = [...beneficiaries]
                          next[i] = { ...next[i], percentage: parseInt(e.target.value) || 0 }
                          setBeneficiaries(next)
                        }}
                        className="w-20"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-[#1B2A4A]"
                          style={{ width: `${b.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-10 text-right">{b.percentage}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {totalPercentage !== 100 && (
            <p className="mt-3 text-xs text-red-500">
              Total: {totalPercentage}% (should be 100%)
            </p>
          )}
          {editingBeneficiaries && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() =>
                setBeneficiaries([
                  ...beneficiaries,
                  { name: '', relationship: '', percentage: 0 },
                ])
              }
            >
              + Add Beneficiary
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Trust Provisions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trust Provisions</CardTitle>
        </CardHeader>
        <CardContent>
          {estate.hasTrusts ? (
            <div className="space-y-2">
              {(Array.isArray(estate.trusts) ? estate.trusts as Array<Record<string, unknown>> : []).map((trust, i) => (
                <div key={i} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {String(trust.trustType ?? 'Trust').replace(/_/g, ' ')} Trust
                  </p>
                  {trust.distributionAge ? (
                    <p className="text-xs text-gray-500 mt-1">Distributes at age {Number(trust.distributionAge)}</p>
                  ) : null}
                  {trust.absoluteDiscretion ? (
                    <Badge variant="info" className="mt-1">Absolute Discretion</Badge>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No trust provisions configured. Minor trust (age {Number(estate.minorTrustAge ?? 25)}) applies by default.</p>
          )}
        </CardContent>
      </Card>

      {/* Executor Chain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Executor Chain</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {arrangements.primaryExecutor ? (
              <div className="flex items-center gap-3">
                <Badge variant="default">Primary</Badge>
                <span className="text-sm text-gray-900">
                  {String((arrangements.primaryExecutor as Record<string, unknown>).firstName ?? '')}{' '}
                  {String((arrangements.primaryExecutor as Record<string, unknown>).lastName ?? '')}
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No primary executor designated</p>
            )}
            {(Array.isArray(arrangements.backupExecutors) ? arrangements.backupExecutors as Array<Record<string, unknown>> : []).map((exec, i) => (
              <div key={i} className="flex items-center gap-3">
                <Badge variant="secondary">Backup {i + 1}</Badge>
                <span className="text-sm text-gray-900">
                  {String(exec.firstName ?? '')} {String(exec.lastName ?? '')}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* POA Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Power of Attorney Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Property (Financial)</h4>
              {poaProp.hasAttorney && poaProp.attorney ? (
                <p className="text-sm text-gray-900">
                  {String((poaProp.attorney as Record<string, unknown>).firstName ?? '')}{' '}
                  {String((poaProp.attorney as Record<string, unknown>).lastName ?? '')}
                </p>
              ) : (
                <p className="text-sm text-gray-400">Not designated</p>
              )}
              {poaProp.effectiveImmediately !== undefined ? (
                <p className="text-xs text-gray-500 mt-1">
                  {poaProp.effectiveImmediately ? 'Effective immediately' : 'Springing (on incapacity)'}
                </p>
              ) : null}
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Personal Care (Health)</h4>
              {poaCare.hasAttorney && poaCare.attorney ? (
                <p className="text-sm text-gray-900">
                  {String((poaCare.attorney as Record<string, unknown>).firstName ?? '')}{' '}
                  {String((poaCare.attorney as Record<string, unknown>).lastName ?? '')}
                </p>
              ) : (
                <p className="text-sm text-gray-400">Not designated</p>
              )}
              {poaCare.lifeSupport ? (
                <p className="text-xs text-gray-500 mt-1 capitalize">
                  Life support: {String(poaCare.lifeSupport).replace(/_/g, ' ')}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
