'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Info, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { StepHeader } from '@/components/will/step-header'
import { StepNavigation } from '@/components/will/step-navigation'
import { AIFlagBanner } from '@/components/will/ai-flag-banner'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import type { AssetData, AssetType, LiabilityData, LiabilityType, OwnershipType } from '@/lib/types/will'

const ASSET_TYPES: { value: AssetType; label: string; icon: string }[] = [
  { value: 'real_estate', label: 'Real Estate', icon: '🏠' },
  { value: 'bank', label: 'Bank Account', icon: '🏦' },
  { value: 'investment', label: 'Investment Account', icon: '📈' },
  { value: 'rrsp', label: 'RRSP', icon: '🏛️' },
  { value: 'tfsa', label: 'TFSA', icon: '💼' },
  { value: 'insurance', label: 'Life Insurance', icon: '🛡️' },
  { value: 'vehicle', label: 'Vehicle', icon: '🚗' },
  { value: 'business', label: 'Business Interest', icon: '🏢' },
  { value: 'resp', label: 'RESP', icon: '🎓' },
  { value: 'pension', label: 'Pension / DPSP', icon: '💰' },
  { value: 'digital', label: 'Digital Assets', icon: '💻' },
  { value: 'personal_property', label: 'Personal Property', icon: '📦' },
]

const LIABILITY_TYPES: { value: LiabilityType; label: string; icon: string }[] = [
  { value: 'mortgage', label: 'Mortgage', icon: '🏠' },
  { value: 'home_equity_line', label: 'Home Equity Line (HELOC)', icon: '🏦' },
  { value: 'car_loan', label: 'Car Loan', icon: '🚗' },
  { value: 'student_loan', label: 'Student Loan', icon: '🎓' },
  { value: 'personal_loan', label: 'Personal Loan', icon: '👤' },
  { value: 'credit_card', label: 'Credit Card', icon: '💳' },
  { value: 'line_of_credit', label: 'Line of Credit', icon: '📋' },
  { value: 'tax_owing', label: 'Tax Owing (CRA/provincial)', icon: '🧾' },
  { value: 'business_loan', label: 'Business Loan', icon: '💼' },
  { value: 'other_debt', label: 'Other Debt', icon: '📝' },
]

const OWNERSHIP_OPTIONS: { value: OwnershipType; label: string }[] = [
  { value: 'sole', label: 'Sole' },
  { value: 'joint_spouse', label: 'Joint with Spouse' },
  { value: 'joint_other', label: 'Joint with Other' },
  { value: 'tenants_in_common', label: 'Tenants in Common' },
]

type TabKey = 'assets' | 'liabilities' | 'summary'

// --- Asset Form ---
function AssetForm({ asset, onChange, onRemove }: { asset: AssetData; onChange: (a: AssetData) => void; onRemove: () => void }) {
  const typeInfo = ASSET_TYPES.find(t => t.value === asset.assetType)
  const needsAddress = asset.assetType === 'real_estate'
  const needsAccount = ['bank', 'investment', 'rrsp', 'tfsa', 'resp'].includes(asset.assetType)
  const needsPolicy = asset.assetType === 'insurance'
  const isJoint = asset.ownershipType === 'joint_spouse' || asset.ownershipType === 'joint_other' || asset.ownershipType === 'tenants_in_common'

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-lg">{typeInfo?.icon} <span className="text-sm font-medium text-gray-700">{typeInfo?.label}</span></span>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={asset.description} onChange={e => onChange({ ...asset, description: e.target.value })} placeholder={`e.g. ${typeInfo?.label} at TD Bank`} />
      </div>
      {needsAddress && (
        <div className="space-y-1.5">
          <Label>Property Address</Label>
          <Input value={asset.address ?? ''} onChange={e => onChange({ ...asset, address: e.target.value })} placeholder="123 Main St, Toronto, ON M5V 1A1" />
        </div>
      )}
      {needsAccount && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>Institution</Label>
            <Input value={asset.institution ?? ''} onChange={e => onChange({ ...asset, institution: e.target.value })} placeholder="TD Bank" />
          </div>
          <div className="space-y-1.5">
            <Label>Account # (last 4)</Label>
            <Input value={asset.accountNumber ?? ''} onChange={e => onChange({ ...asset, accountNumber: e.target.value })} placeholder="****1234" maxLength={4} />
          </div>
        </div>
      )}
      {needsPolicy && (
        <div className="space-y-1.5">
          <Label>Policy Number</Label>
          <Input value={asset.policyNumber ?? ''} onChange={e => onChange({ ...asset, policyNumber: e.target.value })} placeholder="POL-123456" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Estimated Value (optional)</Label>
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
          <Input type="number" value={asset.estimatedValue ?? ''} onChange={e => onChange({ ...asset, estimatedValue: parseFloat(e.target.value) || undefined })} className="pl-7" placeholder="0" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Ownership Type</Label>
        <Select value={asset.ownershipType ?? 'sole'} onValueChange={v => onChange({ ...asset, ownershipType: v as OwnershipType })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {OWNERSHIP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isJoint && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>Joint Owner Name</Label>
            <Input value={asset.jointOwnerName ?? ''} onChange={e => onChange({ ...asset, jointOwnerName: e.target.value })} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Relationship</Label>
            <Input value={asset.jointOwnerRelationship ?? ''} onChange={e => onChange({ ...asset, jointOwnerRelationship: e.target.value })} placeholder="e.g. spouse, adult child" />
          </div>
        </div>
      )}
      <div className="space-y-2 pt-1">
        <Checkbox
          id={`bendes-${asset.id}`}
          checked={!!asset.beneficiaryDesignation}
          onChange={e => onChange({ ...asset, beneficiaryDesignation: (e.target as HTMLInputElement).checked })}
          label="Has named beneficiary designation (RRSP/TFSA/Insurance — passes outside Will)"
        />
        {asset.beneficiaryDesignation && (
          <div className="space-y-1.5 ml-8">
            <Label>Designated Beneficiary Name</Label>
            <Input value={asset.designatedBeneficiaryName ?? ''} onChange={e => onChange({ ...asset, designatedBeneficiaryName: e.target.value })} placeholder="Full legal name of beneficiary" />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label>Probate Classification</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Probate assets pass through your Will. Non-probate assets (joint, beneficiary-designated) pass outside the Will and avoid Estate Administration Tax.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select value={asset.probateClassification ?? 'unclassified'} onValueChange={v => onChange({ ...asset, probateClassification: v as 'probate' | 'non_probate' | 'unclassified' })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="probate">Probate</SelectItem>
            <SelectItem value="non_probate">Non-Probate</SelectItem>
            <SelectItem value="unclassified">Unclassified</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea value={asset.notes ?? ''} onChange={e => onChange({ ...asset, notes: e.target.value })} placeholder="Any additional details for your executor..." rows={2} />
      </div>
    </div>
  )
}

// --- Liability Form ---
function LiabilityForm({ liability, assets, onChange, onRemove }: { liability: LiabilityData; assets: AssetData[]; onChange: (l: LiabilityData) => void; onRemove: () => void }) {
  const typeInfo = LIABILITY_TYPES.find(t => t.value === liability.liabilityType)
  const isJoint = liability.ownershipType === 'joint_spouse' || liability.ownershipType === 'joint_other'

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-lg">{typeInfo?.icon} <span className="text-sm font-medium text-gray-700">{typeInfo?.label}</span></span>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={liability.description} onChange={e => onChange({ ...liability, description: e.target.value })} placeholder={`e.g. ${typeInfo?.label} with TD Bank`} />
      </div>
      <div className="space-y-1.5">
        <Label>Creditor</Label>
        <Input value={liability.creditor ?? ''} onChange={e => onChange({ ...liability, creditor: e.target.value })} placeholder="e.g. TD Bank, CRA" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>Outstanding Balance</Label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
            <Input type="number" value={liability.outstandingBalance ?? ''} onChange={e => onChange({ ...liability, outstandingBalance: parseFloat(e.target.value) || undefined })} className="pl-7" placeholder="0" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Monthly Payment (optional)</Label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
            <Input type="number" value={liability.monthlyPayment ?? ''} onChange={e => onChange({ ...liability, monthlyPayment: parseFloat(e.target.value) || undefined })} className="pl-7" placeholder="0" />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Ownership</Label>
        <Select value={liability.ownershipType ?? 'sole'} onValueChange={v => onChange({ ...liability, ownershipType: v as OwnershipType })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sole">Sole</SelectItem>
            <SelectItem value="joint_spouse">Joint with Spouse</SelectItem>
            <SelectItem value="joint_other">Joint with Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isJoint && (
        <div className="space-y-1.5">
          <Label>Joint Owner Name</Label>
          <Input value={liability.jointOwnerName ?? ''} onChange={e => onChange({ ...liability, jointOwnerName: e.target.value })} placeholder="Full name" />
        </div>
      )}
      {assets.length > 0 && (
        <div className="space-y-1.5">
          <Label>Secured By (optional)</Label>
          <Select value={liability.securedByAssetId ?? '_none'} onValueChange={v => onChange({ ...liability, securedByAssetId: v === '_none' ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder="Link to an asset..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {assets.map(a => {
                const aType = ASSET_TYPES.find(t => t.value === a.assetType)
                return <SelectItem key={a.id} value={a.id}>{aType?.icon} {a.description || aType?.label}</SelectItem>
              })}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea value={liability.notes ?? ''} onChange={e => onChange({ ...liability, notes: e.target.value })} placeholder="Any additional details..." rows={2} />
      </div>
    </div>
  )
}

// --- Summary Tab ---
function SummaryTab({ assets, liabilities }: { assets: AssetData[]; liabilities: LiabilityData[] }) {
  const totalAssets = assets.reduce((sum, a) => sum + (a.estimatedValue ?? 0), 0)
  const totalLiabilities = liabilities.reduce((sum, l) => sum + (l.outstandingBalance ?? 0), 0)
  const netWorth = totalAssets - totalLiabilities

  // Ontario Estate Administration Tax calculation
  const calculateEAT = (value: number): number => {
    if (value <= 0) return 0
    if (value <= 50000) return value * 0.005
    return 50000 * 0.005 + (value - 50000) * 0.015
  }

  // Calculate probate vs non-probate split
  const probateAssets = assets.filter(a => a.probateClassification === 'probate')
  const nonProbateAssets = assets.filter(a => a.probateClassification === 'non_probate')
  const unclassifiedAssets = assets.filter(a => !a.probateClassification || a.probateClassification === 'unclassified')
  const probateTotal = probateAssets.reduce((s, a) => s + (a.estimatedValue ?? 0), 0)
  const nonProbateTotal = nonProbateAssets.reduce((s, a) => s + (a.estimatedValue ?? 0), 0)
  const unclassifiedTotal = unclassifiedAssets.reduce((s, a) => s + (a.estimatedValue ?? 0), 0)

  const eatEstimate = calculateEAT(probateTotal > 0 ? probateTotal : totalAssets)

  // Group assets by type
  const assetsByType = useMemo(() => {
    const grouped: Record<string, { label: string; icon: string; total: number; count: number }> = {}
    for (const a of assets) {
      const info = ASSET_TYPES.find(t => t.value === a.assetType)
      if (!grouped[a.assetType]) {
        grouped[a.assetType] = { label: info?.label ?? a.assetType, icon: info?.icon ?? '', total: 0, count: 0 }
      }
      grouped[a.assetType].total += a.estimatedValue ?? 0
      grouped[a.assetType].count += 1
    }
    return Object.values(grouped).sort((a, b) => b.total - a.total)
  }, [assets])

  // Group liabilities by type
  const liabilitiesByType = useMemo(() => {
    const grouped: Record<string, { label: string; icon: string; total: number; count: number }> = {}
    for (const l of liabilities) {
      const info = LIABILITY_TYPES.find(t => t.value === l.liabilityType)
      if (!grouped[l.liabilityType]) {
        grouped[l.liabilityType] = { label: info?.label ?? l.liabilityType, icon: info?.icon ?? '', total: 0, count: 0 }
      }
      grouped[l.liabilityType].total += l.outstandingBalance ?? 0
      grouped[l.liabilityType].count += 1
    }
    return Object.values(grouped).sort((a, b) => b.total - a.total)
  }, [liabilities])

  return (
    <div className="space-y-4">
      {/* Net Worth Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Net Worth</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Assets</p>
              <p className="text-lg font-semibold text-green-600 flex items-center justify-center gap-1"><TrendingUp className="h-4 w-4" /> ${totalAssets.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Liabilities</p>
              <p className="text-lg font-semibold text-red-500 flex items-center justify-center gap-1"><TrendingDown className="h-4 w-4" /> ${totalLiabilities.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Net Worth</p>
              <p className={`text-lg font-bold ${netWorth >= 0 ? 'text-gray-900' : 'text-red-600'}`}>${netWorth.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assets by Category */}
      {assetsByType.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Assets by Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {assetsByType.map(cat => (
              <div key={cat.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{cat.icon} {cat.label} ({cat.count})</span>
                <span className="font-medium">${cat.total.toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Liabilities by Category */}
      {liabilitiesByType.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Liabilities by Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {liabilitiesByType.map(cat => (
              <div key={cat.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{cat.icon} {cat.label} ({cat.count})</span>
                <span className="font-medium text-red-500">${cat.total.toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Estate Administration Tax */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estate Administration Tax Estimate (Ontario)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Estimated EAT</span>
            <span className="font-semibold">${eatEstimate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <p className="text-xs text-gray-500">Ontario: $5 per $1,000 on first $50,000 + $15 per $1,000 on the remainder. Calculated on {probateTotal > 0 ? 'probate assets' : 'total assets (classify assets to refine)'}.</p>
          {totalAssets > 1000000 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Estate exceeds $1M. Consider a dual Will strategy to keep private company shares and other non-publicly-traded assets out of probate.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Probate vs Non-Probate Split */}
      {(probateAssets.length > 0 || nonProbateAssets.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Probate vs Non-Probate Split</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Probate ({probateAssets.length} assets)</span>
              <span className="font-medium">${probateTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Non-Probate ({nonProbateAssets.length} assets)</span>
              <span className="font-medium">${nonProbateTotal.toLocaleString()}</span>
            </div>
            {unclassifiedAssets.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Unclassified ({unclassifiedAssets.length} assets)</span>
                <span className="text-gray-400">${unclassifiedTotal.toLocaleString()}</span>
              </div>
            )}
            {/* Visual bar */}
            {(probateTotal + nonProbateTotal) > 0 && (
              <div className="h-3 rounded-full overflow-hidden bg-gray-100 flex mt-2">
                <div className="bg-amber-500 transition-all" style={{ width: `${(probateTotal / (probateTotal + nonProbateTotal)) * 100}%` }} />
                <div className="bg-green-500 transition-all" style={{ width: `${(nonProbateTotal / (probateTotal + nonProbateTotal)) * 100}%` }} />
              </div>
            )}
            <div className="flex gap-4 text-xs text-gray-500 mt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Probate</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Non-Probate</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// --- Main Page ---
export default function AssetsPage() {
  const router = useRouter()
  const { will, dispatch } = useWillForm()
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabKey>('assets')
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType>('real_estate')
  const [selectedLiabilityType, setSelectedLiabilityType] = useState<LiabilityType>('mortgage')

  const assets = will.assets
  const liabilities = will.liabilities ?? []

  const totalAssets = assets.reduce((sum, a) => sum + (a.estimatedValue ?? 0), 0)
  const totalLiabilities = liabilities.reduce((sum, l) => sum + (l.outstandingBalance ?? 0), 0)

  function addAsset() {
    dispatch({
      type: 'ADD_ASSET',
      payload: { id: crypto.randomUUID(), assetType: selectedAssetType, description: '' }
    })
  }

  function addLiability() {
    dispatch({
      type: 'ADD_LIABILITY',
      payload: { id: crypto.randomUUID(), liabilityType: selectedLiabilityType, description: '' }
    })
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'assets', label: t.yourAssets ?? 'Assets', count: assets.length },
    { key: 'liabilities', label: (t as unknown as Record<string, string>).liabilities ?? 'Liabilities', count: liabilities.length },
    { key: 'summary', label: (t as unknown as Record<string, string>).summary ?? 'Summary' },
  ]

  return (
    <div className="fade-in">
      <AIFlagBanner />
      <StepHeader
        section={t.yourAssets}
        title="Assets & Liabilities"
        description="A complete inventory helps your executor manage your estate. Values are estimates — your executor will get official valuations."
      />

      {/* Summary bar */}
      {(assets.length > 0 || liabilities.length > 0) && (
        <div className="mb-6 bg-gray-50 rounded-xl p-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{assets.length} asset{assets.length !== 1 ? 's' : ''}, {liabilities.length} liabilit{liabilities.length !== 1 ? 'ies' : 'y'}</span>
            <span className="font-medium text-gray-900">
              Net: ${(totalAssets - totalLiabilities).toLocaleString()}
            </span>
          </div>
          {totalAssets > 1000000 && (
            <p className="text-xs text-amber-600 mt-1">Estate over $1M — Ontario Estate Administration Tax will apply (~$15/$1,000). Consider dual Will strategy for business assets.</p>
          )}
          {totalLiabilities > 0 && totalAssets > 0 && totalLiabilities > totalAssets * 0.5 && (
            <p className="text-xs text-red-600 mt-1">High debt-to-asset ratio ({Math.round((totalLiabilities / totalAssets) * 100)}%). Your estate may face solvency issues.</p>
          )}
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 bg-gray-100 text-gray-600 text-xs rounded-full px-1.5 py-0.5">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Assets Tab */}
      {activeTab === 'assets' && (
        <>
          <div className="space-y-4 mb-6">
            {assets.map(asset => (
              <AssetForm
                key={asset.id}
                asset={asset}
                onChange={updated => dispatch({ type: 'UPDATE_ASSET', payload: updated })}
                onRemove={() => dispatch({ type: 'REMOVE_ASSET', payload: asset.id })}
              />
            ))}
          </div>
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Add an Asset</p>
            <div className="flex gap-2">
              <Select value={selectedAssetType} onValueChange={v => setSelectedAssetType(v as AssetType)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={addAsset} className="gap-2 shrink-0">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Liabilities Tab */}
      {activeTab === 'liabilities' && (
        <>
          <div className="space-y-4 mb-6">
            {liabilities.map(liability => (
              <LiabilityForm
                key={liability.id}
                liability={liability}
                assets={assets}
                onChange={updated => dispatch({ type: 'UPDATE_LIABILITY', payload: updated })}
                onRemove={() => dispatch({ type: 'REMOVE_LIABILITY', payload: liability.id })}
              />
            ))}
          </div>
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">{(t as unknown as Record<string, string>).addLiability ?? 'Add a Liability'}</p>
            <div className="flex gap-2">
              <Select value={selectedLiabilityType} onValueChange={v => setSelectedLiabilityType(v as LiabilityType)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIABILITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={addLiability} className="gap-2 shrink-0">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <SummaryTab assets={assets} liabilities={liabilities} />
      )}

      <StepNavigation
        onBack={() => router.push('/will/poa-personal-care')}
        onContinue={() => {
          dispatch({ type: 'COMPLETE_STEP', payload: 7 })
          router.push('/will/review')
        }}
        continueLabel="Review My Will"
        showSkip
        onSkip={() => {
          dispatch({ type: 'COMPLETE_STEP', payload: 7 })
          router.push('/will/review')
        }}
      />
    </div>
  )
}
