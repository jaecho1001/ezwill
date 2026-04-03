'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ── Types ────────────────────────────────────────────────────────────

interface BeneficiaryEntry {
  name: string
  relationship: string
  percentage: number
}

interface GiftEntry {
  id: string
  type: string
  description: string
  recipientName?: string
  charityName?: string
  amount?: number
}

interface DistributionChartProps {
  beneficiaries: BeneficiaryEntry[]
  gifts: GiftEntry[]
  donations: GiftEntry[]
  residueDistribution: string
  onNavigate?: (section: string) => void
}

// ── Color Palette ────────────────────────────────────────────────────

const COLORS = [
  { bg: 'bg-amber-500', text: 'text-amber-500', light: 'bg-amber-100' },
  { bg: 'bg-blue-500', text: 'text-blue-500', light: 'bg-blue-100' },
  { bg: 'bg-emerald-500', text: 'text-emerald-500', light: 'bg-emerald-100' },
  { bg: 'bg-purple-500', text: 'text-purple-500', light: 'bg-purple-100' },
  { bg: 'bg-pink-500', text: 'text-pink-500', light: 'bg-pink-100' },
  { bg: 'bg-teal-500', text: 'text-teal-500', light: 'bg-teal-100' },
  { bg: 'bg-orange-500', text: 'text-orange-500', light: 'bg-orange-100' },
  { bg: 'bg-indigo-500', text: 'text-indigo-500', light: 'bg-indigo-100' },
]

const RESIDUE_LABELS: Record<string, string> = {
  equal_children: 'Equally to children',
  equal_beneficiaries: 'Equally to named beneficiaries',
  per_stirpes: 'Per stirpes (by representation)',
  custom: 'Custom distribution',
}

// ── Component ────────────────────────────────────────────────────────

export function DistributionChart({
  beneficiaries,
  gifts,
  donations,
  residueDistribution,
  onNavigate,
}: DistributionChartProps) {
  const totalPercentage = useMemo(() =>
    beneficiaries.reduce((sum, b) => sum + b.percentage, 0),
    [beneficiaries]
  )

  const charitableGifts = useMemo(() =>
    [...gifts, ...donations].filter((g) => g.type === 'charity' || g.charityName),
    [gifts, donations]
  )

  const specificGifts = useMemo(() =>
    gifts.filter((g) => g.type !== 'charity' && !g.charityName),
    [gifts]
  )

  if (beneficiaries.length === 0 && specificGifts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-500">No distribution plan configured yet.</p>
        {onNavigate && (
          <button
            onClick={() => onNavigate('your_estate')}
            className="mt-2 text-sm font-medium text-amber-600 hover:text-amber-700"
          >
            Configure beneficiaries
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Horizontal Stacked Bar */}
      {beneficiaries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Beneficiary Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Bar */}
            <div className="flex h-8 w-full overflow-hidden rounded-lg">
              {beneficiaries.map((b, i) => {
                const color = COLORS[i % COLORS.length]
                const widthPct = totalPercentage > 0 ? (b.percentage / totalPercentage) * 100 : 0
                return (
                  <div
                    key={b.name}
                    className={`${color.bg} flex items-center justify-center transition-all`}
                    style={{ width: `${widthPct}%` }}
                    title={`${b.name}: ${b.percentage}%`}
                  >
                    {widthPct > 15 && (
                      <span className="text-[10px] font-bold text-white truncate px-1">
                        {b.percentage}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {beneficiaries.map((b, i) => {
                const color = COLORS[i % COLORS.length]
                return (
                  <div key={b.name} className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${color.bg}`} />
                    <div>
                      <span className="text-sm font-medium text-gray-900">{b.name}</span>
                      <span className="ml-1.5 text-xs text-gray-500">({b.percentage}%)</span>
                      {b.relationship && (
                        <span className="ml-1 text-xs text-gray-400 capitalize">— {b.relationship}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Total warning */}
            {totalPercentage !== 100 && (
              <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                Total allocation: {totalPercentage}% (should be 100%)
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Residue Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Residue Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{RESIDUE_LABELS[residueDistribution] ?? residueDistribution}</Badge>
            {residueDistribution === 'per_stirpes' && (
              <span className="text-xs text-gray-500">
                (if a beneficiary predeceases, their share passes to their issue)
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Specific Gifts */}
      {specificGifts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Specific Gifts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {specificGifts.map((gift) => (
                <div
                  key={gift.id}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                >
                  <span className="mt-0.5 text-base">
                    {gift.type === 'cash' ? '💵' : gift.type === 'real_estate' ? '🏠' : gift.type === 'pet' ? '🐾' : '🎁'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{gift.description}</p>
                    {gift.recipientName && (
                      <p className="text-xs text-gray-500">To: {gift.recipientName}</p>
                    )}
                    {gift.amount !== undefined && gift.amount > 0 && (
                      <p className="text-xs text-gray-500">
                        {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(gift.amount)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charitable Gifts */}
      {charitableGifts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Charitable Gifts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {charitableGifts.map((gift) => (
                <div
                  key={gift.id}
                  className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 px-3 py-2.5"
                >
                  <span className="text-base">🎗️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-900">{gift.charityName ?? gift.description}</p>
                    {gift.amount !== undefined && gift.amount > 0 && (
                      <p className="text-xs text-green-700">
                        {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(gift.amount)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
