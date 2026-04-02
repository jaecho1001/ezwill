'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { StepHeader } from '@/components/will/step-header'
import { StepNavigation } from '@/components/will/step-navigation'
import { AIFlagBanner } from '@/components/will/ai-flag-banner'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import type { AssetData, AssetType } from '@/lib/types/will'

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

function AssetForm({ asset, onChange, onRemove }: { asset: AssetData; onChange: (a: AssetData) => void; onRemove: () => void }) {
  const typeInfo = ASSET_TYPES.find(t => t.value === asset.assetType)
  const needsAddress = asset.assetType === 'real_estate'
  const needsAccount = ['bank', 'investment', 'rrsp', 'tfsa'].includes(asset.assetType)

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-lg">{typeInfo?.icon}</span>
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
      <div className="space-y-1.5">
        <Label>Estimated Value (optional)</Label>
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
          <Input type="number" value={asset.estimatedValue ?? ''} onChange={e => onChange({ ...asset, estimatedValue: parseFloat(e.target.value) || undefined })} className="pl-7" placeholder="0" />
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <Checkbox
          id={`bendes-${asset.id}`}
          checked={!!asset.beneficiaryDesignation}
          onChange={e => onChange({ ...asset, beneficiaryDesignation: (e.target as HTMLInputElement).checked })}
          label="Has named beneficiary designation (RRSP/TFSA/Insurance — passes outside Will)"
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>Joint Owner Name (if any)</Label>
            <Input value={asset.jointOwnerName ?? ''} onChange={e => onChange({ ...asset, jointOwnerName: e.target.value })} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Relationship</Label>
            <Input value={asset.jointOwnerRelationship ?? ''} onChange={e => onChange({ ...asset, jointOwnerRelationship: e.target.value })} placeholder="e.g. spouse, adult child" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AssetsPage() {
  const router = useRouter()
  const { will, dispatch } = useWillForm()
  const { t } = useTranslation()
  const [selectedType, setSelectedType] = useState<AssetType>('real_estate')
  const assets = will.assets

  function addAsset() {
    dispatch({
      type: 'ADD_ASSET',
      payload: { id: crypto.randomUUID(), assetType: selectedType, description: '' }
    })
  }

  const totalEstimate = assets.reduce((sum, a) => sum + (a.estimatedValue ?? 0), 0)

  return (
    <div className="fade-in">
      <AIFlagBanner />
      <StepHeader
        section={t.yourAssets}
        title="Your Asset Inventory"
        description="An asset inventory helps your executor locate and manage your estate. Values are estimates — your executor will get official valuations."
      />

      {assets.length > 0 && (
        <div className="mb-6 bg-gray-50 rounded-xl p-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{assets.length} asset{assets.length !== 1 ? 's' : ''} listed</span>
            {totalEstimate > 0 && (
              <span className="font-medium text-gray-900">~${totalEstimate.toLocaleString()} estimated</span>
            )}
          </div>
          {totalEstimate > 1000000 && (
            <p className="text-xs text-amber-600 mt-1">Estate over $1M — Ontario Estate Administration Tax will apply (~$15/$1,000). Consider dual Will strategy for business assets.</p>
          )}
        </div>
      )}

      <div className="space-y-4 mb-6">
        {assets.map(asset => (
          <AssetForm
            key={asset.id}
            asset={asset}
            onChange={updated => {
              dispatch({ type: 'REMOVE_ASSET', payload: updated.id })
              dispatch({ type: 'ADD_ASSET', payload: updated })
            }}
            onRemove={() => dispatch({ type: 'REMOVE_ASSET', payload: asset.id })}
          />
        ))}
      </div>

      <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Add an Asset</p>
        <div className="flex gap-2">
          <Select value={selectedType} onValueChange={v => setSelectedType(v as AssetType)}>
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
