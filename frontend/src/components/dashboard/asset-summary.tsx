'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────

interface AssetRecord {
  id: string
  assetType: string
  description: string
  estimatedValue?: number
  address?: string
  institution?: string
  beneficiaryDesignation?: boolean
  jointOwnerName?: string
  jointOwnerRelationship?: string
}

type SortField = 'assetType' | 'description' | 'estimatedValue'
type SortDir = 'asc' | 'desc'

const ASSET_TYPE_CONFIG: Record<string, { label: string; icon: string; category: string }> = {
  real_estate:       { label: 'Real Estate',       icon: '🏠', category: 'real_estate' },
  bank:              { label: 'Bank Account',      icon: '🏦', category: 'financial' },
  investment:        { label: 'Investment',         icon: '📈', category: 'financial' },
  rrsp:              { label: 'RRSP',               icon: '💰', category: 'financial' },
  tfsa:              { label: 'TFSA',               icon: '💰', category: 'financial' },
  resp:              { label: 'RESP',               icon: '🎓', category: 'financial' },
  pension:           { label: 'Pension',            icon: '📋', category: 'financial' },
  insurance:         { label: 'Life Insurance',     icon: '🛡️', category: 'financial' },
  vehicle:           { label: 'Vehicle',            icon: '🚗', category: 'personal_property' },
  business:          { label: 'Business Interest',  icon: '🏢', category: 'business' },
  digital:           { label: 'Digital Asset',      icon: '💻', category: 'personal_property' },
  personal_property: { label: 'Personal Property',  icon: '📦', category: 'personal_property' },
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value)
}

function getOwnershipLabel(asset: AssetRecord): string {
  if (asset.jointOwnerName) return `Joint — ${asset.jointOwnerName}`
  return 'Sole'
}

function getProbateStatus(asset: AssetRecord, isDualWill: boolean): 'probate' | 'non-probate' | 'n/a' {
  if (!isDualWill) return 'n/a'
  // Non-probate: business interests, private company shares
  if (asset.assetType === 'business') return 'non-probate'
  // Assets with beneficiary designation bypass probate
  if (asset.beneficiaryDesignation) return 'non-probate'
  // Joint assets with right of survivorship bypass probate
  if (asset.jointOwnerName) return 'non-probate'
  return 'probate'
}

// ── Component ────────────────────────────────────────────────────────

interface AssetSummaryProps {
  assets: Array<Record<string, unknown>>
  isDualWill: boolean
  onNavigate?: (section: string) => void
}

export function AssetSummary({ assets, isDualWill, onNavigate }: AssetSummaryProps) {
  const [sortField, setSortField] = useState<SortField>('assetType')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const typedAssets: AssetRecord[] = useMemo(() =>
    assets.map((a) => ({
      id: String(a.id ?? ''),
      assetType: String(a.assetType ?? 'personal_property'),
      description: String(a.description ?? ''),
      estimatedValue: typeof a.estimatedValue === 'number' ? a.estimatedValue : undefined,
      address: a.address ? String(a.address) : undefined,
      institution: a.institution ? String(a.institution) : undefined,
      beneficiaryDesignation: Boolean(a.beneficiaryDesignation),
      jointOwnerName: a.jointOwnerName ? String(a.jointOwnerName) : undefined,
      jointOwnerRelationship: a.jointOwnerRelationship ? String(a.jointOwnerRelationship) : undefined,
    })),
    [assets]
  )

  // Category summaries
  const summaries = useMemo(() => {
    const cats = {
      real_estate: { label: 'Real Estate', count: 0, value: 0 },
      financial: { label: 'Financial Assets', count: 0, value: 0 },
      business: { label: 'Business Interests', count: 0, value: 0 },
      personal_property: { label: 'Personal Property', count: 0, value: 0 },
    }
    let total = 0

    for (const asset of typedAssets) {
      const cfg = ASSET_TYPE_CONFIG[asset.assetType]
      const cat = cfg?.category ?? 'personal_property'
      const catEntry = cats[cat as keyof typeof cats]
      if (catEntry) {
        catEntry.count++
        catEntry.value += asset.estimatedValue ?? 0
      }
      total += asset.estimatedValue ?? 0
    }

    return { categories: cats, total }
  }, [typedAssets])

  // Sorting
  const sortedAssets = useMemo(() => {
    const sorted = [...typedAssets]
    sorted.sort((a, b) => {
      let cmp = 0
      if (sortField === 'estimatedValue') {
        cmp = (a.estimatedValue ?? 0) - (b.estimatedValue ?? 0)
      } else {
        cmp = (a[sortField] ?? '').localeCompare(b[sortField] ?? '')
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [typedAssets, sortField, sortDir])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField])

  const handleExportCSV = useCallback(() => {
    const headers = ['Type', 'Description', 'Estimated Value', 'Ownership', 'Probate Status']
    const rows = sortedAssets.map((a) => [
      ASSET_TYPE_CONFIG[a.assetType]?.label ?? a.assetType,
      `"${a.description.replace(/"/g, '""')}"`,
      a.estimatedValue ?? '',
      getOwnershipLabel(a),
      getProbateStatus(a, isDualWill),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'estate-assets.csv'
    link.click()
    URL.revokeObjectURL(url)
  }, [sortedAssets, isDualWill])

  if (typedAssets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-500">No assets declared yet.</p>
        {onNavigate && (
          <button
            onClick={() => onNavigate('assets')}
            className="mt-2 text-sm font-medium text-amber-600 hover:text-amber-700"
          >
            Add assets
          </button>
        )}
      </div>
    )
  }

  const SortIcon = ({ field }: { field: SortField }) => (
    <svg
      className={cn('ml-1 inline h-3 w-3', sortField === field ? 'text-amber-600' : 'text-gray-400')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
        sortField === field && sortDir === 'desc'
          ? 'M19 9l-7 7-7-7'
          : 'M5 15l7-7 7 7'
      } />
    </svg>
  )

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total */}
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-amber-600">Total Estimated Value</p>
            <p className="mt-1 text-lg font-bold text-amber-900">{formatCurrency(summaries.total)}</p>
            <p className="text-xs text-amber-600">{typedAssets.length} asset{typedAssets.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        {Object.entries(summaries.categories).map(([key, cat]) => (
          <Card key={key}>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-gray-500">{cat.label}</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatCurrency(cat.value)}</p>
              <p className="text-xs text-gray-500">{cat.count} item{cat.count !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dual will allocation summary */}
      {isDualWill && (
        <div className="flex gap-3">
          <div className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium text-blue-600">Probate Will Assets</p>
            <p className="text-sm font-bold text-blue-900">
              {sortedAssets.filter((a) => getProbateStatus(a, true) === 'probate').length} items
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
            <p className="text-xs font-medium text-purple-600">Non-Probate Will Assets</p>
            <p className="text-sm font-bold text-purple-900">
              {sortedAssets.filter((a) => getProbateStatus(a, true) === 'non-probate').length} items
            </p>
          </div>
        </div>
      )}

      {/* Asset Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Asset Details</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <svg className="mr-1.5 h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th
                    className="cursor-pointer px-4 py-2.5 text-left text-xs font-medium text-gray-500 hover:text-gray-700"
                    onClick={() => handleSort('assetType')}
                  >
                    Type <SortIcon field="assetType" />
                  </th>
                  <th
                    className="cursor-pointer px-4 py-2.5 text-left text-xs font-medium text-gray-500 hover:text-gray-700"
                    onClick={() => handleSort('description')}
                  >
                    Description <SortIcon field="description" />
                  </th>
                  <th
                    className="cursor-pointer px-4 py-2.5 text-right text-xs font-medium text-gray-500 hover:text-gray-700"
                    onClick={() => handleSort('estimatedValue')}
                  >
                    Est. Value <SortIcon field="estimatedValue" />
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ownership</th>
                  {isDualWill && (
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Will</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedAssets.map((asset) => {
                  const cfg = ASSET_TYPE_CONFIG[asset.assetType]
                  const probate = getProbateStatus(asset, isDualWill)
                  return (
                    <tr key={asset.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{cfg?.icon ?? '📦'}</span>
                          <span className="text-xs font-medium text-gray-700">{cfg?.label ?? asset.assetType}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{asset.description}</p>
                        {asset.institution && (
                          <p className="text-xs text-gray-400">{asset.institution}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="text-sm font-medium text-gray-900">
                          {asset.estimatedValue ? formatCurrency(asset.estimatedValue) : '--'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="text-xs text-gray-600">{getOwnershipLabel(asset)}</span>
                      </td>
                      {isDualWill && (
                        <td className="whitespace-nowrap px-4 py-3">
                          {probate === 'probate' ? (
                            <Badge variant="info" className="text-[10px]">Probate</Badge>
                          ) : probate === 'non-probate' ? (
                            <Badge className="text-[10px] bg-purple-100 text-purple-700 border-transparent">Non-Probate</Badge>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
