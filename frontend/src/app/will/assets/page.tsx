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

const ASSET_TYPES: { value: AssetType; labelKey: string; icon: string }[] = [
  { value: 'real_estate', labelKey: 'assets_typeRealEstate', icon: '🏠' },
  { value: 'bank', labelKey: 'assets_typeBank', icon: '🏦' },
  { value: 'investment', labelKey: 'assets_typeInvestment', icon: '📈' },
  { value: 'rrsp', labelKey: 'assets_typeRrsp', icon: '🏛️' },
  { value: 'tfsa', labelKey: 'assets_typeTfsa', icon: '💼' },
  { value: 'insurance', labelKey: 'assets_typeInsurance', icon: '🛡️' },
  { value: 'vehicle', labelKey: 'assets_typeVehicle', icon: '🚗' },
  { value: 'business', labelKey: 'assets_typeBusiness', icon: '🏢' },
  { value: 'resp', labelKey: 'assets_typeResp', icon: '🎓' },
  { value: 'pension', labelKey: 'assets_typePension', icon: '💰' },
  { value: 'digital', labelKey: 'assets_typeDigital', icon: '💻' },
  { value: 'personal_property', labelKey: 'assets_typePersonalProperty', icon: '📦' },
]

const LIABILITY_TYPES: { value: LiabilityType; labelKey: string; icon: string }[] = [
  { value: 'mortgage', labelKey: 'assets_liabMortgage', icon: '🏠' },
  { value: 'home_equity_line', labelKey: 'assets_liabHeloc', icon: '🏦' },
  { value: 'car_loan', labelKey: 'assets_liabCarLoan', icon: '🚗' },
  { value: 'student_loan', labelKey: 'assets_liabStudentLoan', icon: '🎓' },
  { value: 'personal_loan', labelKey: 'assets_liabPersonalLoan', icon: '👤' },
  { value: 'credit_card', labelKey: 'assets_liabCreditCard', icon: '💳' },
  { value: 'line_of_credit', labelKey: 'assets_liabLineOfCredit', icon: '📋' },
  { value: 'tax_owing', labelKey: 'assets_liabTaxOwing', icon: '🧾' },
  { value: 'business_loan', labelKey: 'assets_liabBusinessLoan', icon: '💼' },
  { value: 'other_debt', labelKey: 'assets_liabOtherDebt', icon: '📝' },
]

const OWNERSHIP_OPTIONS: { value: OwnershipType; labelKey: string }[] = [
  { value: 'sole', labelKey: 'assets_ownSole' },
  { value: 'joint_spouse', labelKey: 'assets_ownJointSpouse' },
  { value: 'joint_other', labelKey: 'assets_ownJointOther' },
  { value: 'tenants_in_common', labelKey: 'assets_ownTenantsInCommon' },
]

type TabKey = 'assets' | 'liabilities' | 'summary'

// --- Asset Form ---
function AssetForm({ asset, onChange, onRemove }: { asset: AssetData; onChange: (a: AssetData) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const tx = t as unknown as Record<string, string>
  const typeInfo = ASSET_TYPES.find(at => at.value === asset.assetType)
  const typeLabel = typeInfo ? tx[typeInfo.labelKey] : ''
  const needsAddress = asset.assetType === 'real_estate'
  const needsAccount = ['bank', 'investment', 'rrsp', 'tfsa', 'resp'].includes(asset.assetType)
  const needsPolicy = asset.assetType === 'insurance'
  const isJoint = asset.ownershipType === 'joint_spouse' || asset.ownershipType === 'joint_other' || asset.ownershipType === 'tenants_in_common'

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-lg">{typeInfo?.icon} <span className="text-sm font-medium text-gray-700">{typeLabel}</span></span>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="space-y-1.5">
        <Label>{t.assets_description}</Label>
        <Input value={asset.description} onChange={e => onChange({ ...asset, description: e.target.value })} placeholder={`${t.assets_egPrefix}${typeLabel} ${t.assets_atTdBank}`} />
      </div>
      {needsAddress && (
        <div className="space-y-1.5">
          <Label>{t.assets_propertyAddress}</Label>
          <Input value={asset.address ?? ''} onChange={e => onChange({ ...asset, address: e.target.value })} placeholder={t.assets_addressPlaceholder} />
        </div>
      )}
      {needsAccount && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>{t.assets_institution}</Label>
            <Input value={asset.institution ?? ''} onChange={e => onChange({ ...asset, institution: e.target.value })} placeholder={t.assets_institutionPlaceholder} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.assets_accountLast4}</Label>
            <Input value={asset.accountNumber ?? ''} onChange={e => onChange({ ...asset, accountNumber: e.target.value })} placeholder={t.assets_accountPlaceholder} maxLength={4} />
          </div>
        </div>
      )}
      {needsPolicy && (
        <div className="space-y-1.5">
          <Label>{t.assets_policyNumber}</Label>
          <Input value={asset.policyNumber ?? ''} onChange={e => onChange({ ...asset, policyNumber: e.target.value })} placeholder={t.assets_policyPlaceholder} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label>{t.assets_estimatedValue}</Label>
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
          <Input type="number" value={asset.estimatedValue ?? ''} onChange={e => onChange({ ...asset, estimatedValue: parseFloat(e.target.value) || undefined })} className="pl-7" placeholder="0" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t.assets_ownershipType}</Label>
        <Select value={asset.ownershipType ?? 'sole'} onValueChange={v => onChange({ ...asset, ownershipType: v as OwnershipType })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {OWNERSHIP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{tx[o.labelKey]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isJoint && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>{t.assets_jointOwnerName}</Label>
            <Input value={asset.jointOwnerName ?? ''} onChange={e => onChange({ ...asset, jointOwnerName: e.target.value })} placeholder={t.assets_fullNamePlaceholder} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.assets_relationship}</Label>
            <Input value={asset.jointOwnerRelationship ?? ''} onChange={e => onChange({ ...asset, jointOwnerRelationship: e.target.value })} placeholder={t.assets_relationshipPlaceholder} />
          </div>
        </div>
      )}
      <div className="space-y-2 pt-1">
        <Checkbox
          id={`bendes-${asset.id}`}
          checked={!!asset.beneficiaryDesignation}
          onChange={e => onChange({ ...asset, beneficiaryDesignation: (e.target as HTMLInputElement).checked })}
          label={t.assets_beneficiaryDesignationLabel}
        />
        {asset.beneficiaryDesignation && (
          <div className="space-y-1.5 ml-8">
            <Label>{t.assets_designatedBeneficiaryName}</Label>
            <Input value={asset.designatedBeneficiaryName ?? ''} onChange={e => onChange({ ...asset, designatedBeneficiaryName: e.target.value })} placeholder={t.assets_beneficiaryNamePlaceholder} />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <Label>{t.assets_probateClassification}</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t.assets_probateTooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select value={asset.probateClassification ?? 'unclassified'} onValueChange={v => onChange({ ...asset, probateClassification: v as 'probate' | 'non_probate' | 'unclassified' })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="probate">{t.assets_probate}</SelectItem>
            <SelectItem value="non_probate">{t.assets_nonProbate}</SelectItem>
            <SelectItem value="unclassified">{t.assets_unclassified}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t.assets_notesOptional}</Label>
        <Textarea value={asset.notes ?? ''} onChange={e => onChange({ ...asset, notes: e.target.value })} placeholder={t.assets_notesExecutorPlaceholder} rows={2} />
      </div>
    </div>
  )
}

// --- Liability Form ---
function LiabilityForm({ liability, assets, onChange, onRemove }: { liability: LiabilityData; assets: AssetData[]; onChange: (l: LiabilityData) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const tx = t as unknown as Record<string, string>
  const typeInfo = LIABILITY_TYPES.find(lt => lt.value === liability.liabilityType)
  const typeLabel = typeInfo ? tx[typeInfo.labelKey] : ''
  const isJoint = liability.ownershipType === 'joint_spouse' || liability.ownershipType === 'joint_other'

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-lg">{typeInfo?.icon} <span className="text-sm font-medium text-gray-700">{typeLabel}</span></span>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="space-y-1.5">
        <Label>{t.assets_description}</Label>
        <Input value={liability.description} onChange={e => onChange({ ...liability, description: e.target.value })} placeholder={`${t.assets_egPrefix}${typeLabel} ${t.assets_withTdBank}`} />
      </div>
      <div className="space-y-1.5">
        <Label>{t.assets_creditor}</Label>
        <Input value={liability.creditor ?? ''} onChange={e => onChange({ ...liability, creditor: e.target.value })} placeholder={t.assets_creditorPlaceholder} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>{t.assets_outstandingBalance}</Label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
            <Input type="number" value={liability.outstandingBalance ?? ''} onChange={e => onChange({ ...liability, outstandingBalance: parseFloat(e.target.value) || undefined })} className="pl-7" placeholder="0" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t.assets_monthlyPayment}</Label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
            <Input type="number" value={liability.monthlyPayment ?? ''} onChange={e => onChange({ ...liability, monthlyPayment: parseFloat(e.target.value) || undefined })} className="pl-7" placeholder="0" />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t.assets_ownership}</Label>
        <Select value={liability.ownershipType ?? 'sole'} onValueChange={v => onChange({ ...liability, ownershipType: v as OwnershipType })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sole">{t.assets_ownSole}</SelectItem>
            <SelectItem value="joint_spouse">{t.assets_ownJointSpouse}</SelectItem>
            <SelectItem value="joint_other">{t.assets_ownJointOther}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isJoint && (
        <div className="space-y-1.5">
          <Label>{t.assets_jointOwnerName}</Label>
          <Input value={liability.jointOwnerName ?? ''} onChange={e => onChange({ ...liability, jointOwnerName: e.target.value })} placeholder={t.assets_fullNamePlaceholder} />
        </div>
      )}
      {assets.length > 0 && (
        <div className="space-y-1.5">
          <Label>{t.assets_securedBy}</Label>
          <Select value={liability.securedByAssetId ?? '_none'} onValueChange={v => onChange({ ...liability, securedByAssetId: v === '_none' ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder={t.assets_linkToAsset} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{t.assets_none}</SelectItem>
              {assets.map(a => {
                const aType = ASSET_TYPES.find(at => at.value === a.assetType)
                return <SelectItem key={a.id} value={a.id}>{aType?.icon} {a.description || (aType ? tx[aType.labelKey] : '')}</SelectItem>
              })}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>{t.assets_notesOptional}</Label>
        <Textarea value={liability.notes ?? ''} onChange={e => onChange({ ...liability, notes: e.target.value })} placeholder={t.assets_notesPlaceholder} rows={2} />
      </div>
    </div>
  )
}

// --- Summary Tab ---
function SummaryTab({ assets, liabilities }: { assets: AssetData[]; liabilities: LiabilityData[] }) {
  const { t } = useTranslation()
  const tx = t as unknown as Record<string, string>
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
    const grouped: Record<string, { labelKey: string; icon: string; total: number; count: number }> = {}
    for (const a of assets) {
      const info = ASSET_TYPES.find(at => at.value === a.assetType)
      if (!grouped[a.assetType]) {
        grouped[a.assetType] = { labelKey: info?.labelKey ?? '', icon: info?.icon ?? '', total: 0, count: 0 }
      }
      grouped[a.assetType].total += a.estimatedValue ?? 0
      grouped[a.assetType].count += 1
    }
    return Object.values(grouped).sort((a, b) => b.total - a.total)
  }, [assets])

  // Group liabilities by type
  const liabilitiesByType = useMemo(() => {
    const grouped: Record<string, { labelKey: string; icon: string; total: number; count: number }> = {}
    for (const l of liabilities) {
      const info = LIABILITY_TYPES.find(lt => lt.value === l.liabilityType)
      if (!grouped[l.liabilityType]) {
        grouped[l.liabilityType] = { labelKey: info?.labelKey ?? '', icon: info?.icon ?? '', total: 0, count: 0 }
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
          <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> {t.assets_netWorth}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500 mb-1">{t.assets_totalAssets}</p>
              <p className="text-lg font-semibold text-green-600 flex items-center justify-center gap-1"><TrendingUp className="h-4 w-4" /> ${totalAssets.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{t.assets_totalLiabilities}</p>
              <p className="text-lg font-semibold text-red-500 flex items-center justify-center gap-1"><TrendingDown className="h-4 w-4" /> ${totalLiabilities.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{t.assets_netWorth}</p>
              <p className={`text-lg font-bold ${netWorth >= 0 ? 'text-gray-900' : 'text-red-600'}`}>${netWorth.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assets by Category */}
      {assetsByType.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.assets_assetsByCategory}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {assetsByType.map(cat => (
              <div key={cat.labelKey} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{cat.icon} {tx[cat.labelKey]} ({cat.count})</span>
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
            <CardTitle className="text-base">{t.assets_liabilitiesByCategory}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {liabilitiesByType.map(cat => (
              <div key={cat.labelKey} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{cat.icon} {tx[cat.labelKey]} ({cat.count})</span>
                <span className="font-medium text-red-500">${cat.total.toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Estate Administration Tax */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.assets_eatTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t.assets_estimatedEat}</span>
            <span className="font-semibold">${eatEstimate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <p className="text-xs text-gray-500">{t.assets_eatNote}{probateTotal > 0 ? t.assets_eatProbateAssets : t.assets_eatTotalAssets}.</p>
          {totalAssets > 1000000 && (
            <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/40 rounded-lg p-3 text-sm text-[#8a6a1e]">
              {t.assets_estateExceeds1m}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Probate vs Non-Probate Split */}
      {(probateAssets.length > 0 || nonProbateAssets.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.assets_probateSplit}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t.assets_probate} ({probateAssets.length} {t.assets_assetsWord})</span>
              <span className="font-medium">${probateTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t.assets_nonProbate} ({nonProbateAssets.length} {t.assets_assetsWord})</span>
              <span className="font-medium">${nonProbateTotal.toLocaleString()}</span>
            </div>
            {unclassifiedAssets.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t.assets_unclassified} ({unclassifiedAssets.length} {t.assets_assetsWord})</span>
                <span className="text-gray-400">${unclassifiedTotal.toLocaleString()}</span>
              </div>
            )}
            {/* Visual bar */}
            {(probateTotal + nonProbateTotal) > 0 && (
              <div className="h-3 rounded-full overflow-hidden bg-gray-100 flex mt-2">
                <div className="bg-[#C9A84C] transition-all" style={{ width: `${(probateTotal / (probateTotal + nonProbateTotal)) * 100}%` }} />
                <div className="bg-green-500 transition-all" style={{ width: `${(nonProbateTotal / (probateTotal + nonProbateTotal)) * 100}%` }} />
              </div>
            )}
            <div className="flex gap-4 text-xs text-gray-500 mt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#C9A84C] inline-block" /> {t.assets_probate}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> {t.assets_nonProbate}</span>
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
  const tx = t as unknown as Record<string, string>
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
        title={t.assets_pageTitle}
        description={t.assets_pageDescription}
      />

      {/* Summary bar */}
      {(assets.length > 0 || liabilities.length > 0) && (
        <div className="mb-6 bg-gray-50 rounded-xl p-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{assets.length} {t.assets_assetsWord}, {liabilities.length} {t.assets_liabilitiesWord}</span>
            <span className="font-medium text-gray-900">
              {t.assets_netLabel}${(totalAssets - totalLiabilities).toLocaleString()}
            </span>
          </div>
          {totalAssets > 1000000 && (
            <p className="text-xs text-[#8a6a1e] mt-1">{t.assets_estateOver1m}</p>
          )}
          {totalLiabilities > 0 && totalAssets > 0 && totalLiabilities > totalAssets * 0.5 && (
            <p className="text-xs text-red-600 mt-1">{t.assets_highDebtPrefix}{Math.round((totalLiabilities / totalAssets) * 100)}{t.assets_highDebtSuffix}</p>
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
                ? 'border-[#1B2A4A] text-[#1B2A4A]'
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
            <p className="text-sm font-medium text-gray-700">{t.assets_addAnAsset}</p>
            <div className="flex gap-2">
              <Select value={selectedAssetType} onValueChange={v => setSelectedAssetType(v as AssetType)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map(at => <SelectItem key={at.value} value={at.value}>{at.icon} {tx[at.labelKey]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={addAsset} className="gap-2 shrink-0">
                <Plus className="h-4 w-4" /> {t.assets_add}
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
                  {LIABILITY_TYPES.map(lt => <SelectItem key={lt.value} value={lt.value}>{lt.icon} {tx[lt.labelKey]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={addLiability} className="gap-2 shrink-0">
                <Plus className="h-4 w-4" /> {t.assets_add}
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
        continueLabel={t.reviewWill}
        showSkip
        onSkip={() => {
          dispatch({ type: 'COMPLETE_STEP', payload: 7 })
          router.push('/will/review')
        }}
      />
    </div>
  )
}
