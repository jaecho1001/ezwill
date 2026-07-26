'use client'

import { useId } from 'react'
import type { IntakeQuestion } from '@/lib/intake/will-intake-script'
import type {
  VaultAssetItem,
  VaultBeneficiary,
  VaultChild,
  VaultGift,
  VaultLiability,
  VaultPerson,
} from '@/types/will-vault'
import type { Language } from '@/lib/types/will'
import { L } from '@/lib/intake/localize'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface Props {
  question: IntakeQuestion
  value: unknown
  onChange: (value: unknown) => void
  language: Language
  error?: string | null
}

export function QuestionCard({ question, value, onChange, language, error }: Props) {
  const id = useId()
  return (
    <div className="rounded-xl border border-[#E8E4DF] bg-white p-5 shadow-sm">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-900">
        {L(language, question.prompt, question.promptKo)}
        {question.required && <span className="ml-1 text-gray-600">({L(language, 'required', '필수')})</span>}
      </label>
      {question.helpText && (
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
          {L(language, question.helpText, question.helpTextKo)}
        </p>
      )}
      <div className="mt-3">{renderInput(id, question, value, onChange, language)}</div>
      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  )
}

function renderInput(
  id: string,
  q: IntakeQuestion,
  value: unknown,
  onChange: (v: unknown) => void,
  language: Language
) {
  const ph = q.placeholder ? L(language, q.placeholder, q.placeholderKo) : undefined
  switch (q.kind) {
    case 'text':
      return (
        <Input
          id={id}
          value={(value as string) ?? ''}
          placeholder={ph}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={(value as string) ?? ''}
          placeholder={ph}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'date':
      return (
        <Input
          id={id}
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          value={(value as number | undefined) ?? ''}
          placeholder={ph}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )
    case 'boolean': {
      const bool = value as boolean | undefined
      return (
        <div className="flex gap-2">
          <ToggleChip selected={bool === true} onClick={() => onChange(true)}>{L(language, 'Yes', '예')}</ToggleChip>
          <ToggleChip selected={bool === false} onClick={() => onChange(false)}>{L(language, 'No', '아니오')}</ToggleChip>
          {bool !== undefined && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600"
            >
              {L(language, 'Clear', '지우기')}
            </button>
          )}
        </div>
      )
    }
    case 'select':
      return (
        <select
          id={id}
          className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25 focus:border-[#1B2A4A]"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">{L(language, '— Select —', '— 선택 —')}</option>
          {q.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {L(language, o.label, o.labelKo)}
            </option>
          ))}
        </select>
      )
    case 'personList':
      return <PersonListEditor value={(value as VaultPerson[]) ?? []} onChange={onChange} language={language} />
    case 'childList':
      return <ChildListEditor value={(value as VaultChild[]) ?? []} onChange={onChange} language={language} />
    case 'beneficiaryList':
      return <BeneficiaryListEditor value={(value as VaultBeneficiary[]) ?? []} onChange={onChange} language={language} />
    case 'giftList':
      return <GiftListEditor value={(value as VaultGift[]) ?? []} onChange={onChange} language={language} />
    case 'assetList':
      return <AssetListEditor value={(value as VaultAssetItem[]) ?? []} onChange={onChange} language={language} />
    case 'liabilityList':
      return <LiabilityListEditor value={(value as VaultLiability[]) ?? []} onChange={onChange} language={language} />
    default:
      return null
  }
}

function ToggleChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-4 py-1.5 text-sm transition-colors ' +
        (selected
          ? 'border-[#1B2A4A] bg-[#1B2A4A]/10 text-[#1B2A4A]'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
      }
    >
      {children}
    </button>
  )
}

function PersonListEditor({
  value,
  onChange,
  language,
}: {
  value: VaultPerson[]
  onChange: (next: VaultPerson[]) => void
  language: Language
}) {
  const update = (idx: number, patch: Partial<VaultPerson>) => {
    onChange(value.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx))
  const add = (isBackup: boolean) =>
    onChange([
      ...value,
      { id: crypto.randomUUID(), fullName: '', isBackup },
    ])

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
          {L(language, 'No one added yet. Use the buttons below.', '아직 추가된 사람이 없습니다. 아래 버튼을 사용하세요.')}
        </p>
      )}
      {value.map((p, i) => (
        <div key={p.id} className="grid gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-[auto_1fr_12rem_auto] sm:items-center">
          <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{ background: p.isBackup ? '#F6EEDA' : '#E9F1EC', color: p.isBackup ? '#8a6a1e' : '#4A6B57' }}>
            {p.isBackup ? L(language, 'Backup', '예비') : L(language, 'Primary', '기본')}
          </span>
          <Input
            className="h-8"
            value={p.fullName}
            placeholder={L(language, 'Full legal name', '전체 법적 이름')}
            onChange={(e) => update(i, { fullName: e.target.value })}
          />
          <Input
            className="h-8"
            value={p.relationship ?? ''}
            placeholder={L(language, 'Relationship', '관계')}
            onChange={(e) => update(i, { relationship: e.target.value })}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 text-xs text-gray-400 hover:text-red-600"
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => add(false)}>
          {L(language, '+ Primary', '+ 기본')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => add(true)}>
          {L(language, '+ Backup', '+ 예비')}
        </Button>
      </div>
    </div>
  )
}

function ChildListEditor({
  value,
  onChange,
  language,
}: {
  value: VaultChild[]
  onChange: (next: VaultChild[]) => void
  language: Language
}) {
  const update = (idx: number, patch: Partial<VaultChild>) => {
    onChange(value.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx))
  const add = () =>
    onChange([...value, { id: crypto.randomUUID(), fullName: '' }])

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
          {L(language, 'No children added.', '추가된 자녀가 없습니다.')}
        </p>
      )}
      {value.map((c, i) => (
        <div key={c.id} className="grid gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-center">
          <Input
            className="h-8"
            value={c.fullName}
            placeholder={L(language, 'Full legal name', '전체 법적 이름')}
            onChange={(e) => update(i, { fullName: e.target.value })}
          />
          <Input
            className="h-8"
            type="date"
            value={c.dob ?? ''}
            onChange={(e) => update(i, { dob: e.target.value })}
          />
          <label className="flex shrink-0 items-center gap-1 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={!!c.fromPriorRelationship}
              onChange={(e) => update(i, { fromPriorRelationship: e.target.checked })}
            />
            {L(language, 'Prior relationship', '이전 관계')}
          </label>
          <label className="flex shrink-0 items-center gap-1 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={!!c.receivesODSP}
              onChange={(e) => update(i, { receivesODSP: e.target.checked })}
            />
            ODSP
          </label>
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 text-xs text-gray-400 hover:text-red-600"
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        {L(language, '+ Add child', '+ 자녀 추가')}
      </Button>
    </div>
  )
}

function BeneficiaryListEditor({
  value,
  onChange,
  language,
}: {
  value: VaultBeneficiary[]
  onChange: (next: VaultBeneficiary[]) => void
  language: Language
}) {
  const update = (idx: number, patch: Partial<VaultBeneficiary>) =>
    onChange(value.map((person, i) => i === idx ? { ...person, ...patch } : person))
  return (
    <div className="space-y-2">
      {value.map((person, idx) => (
        <div key={person.id} className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_10rem_7rem_auto]">
          <Input value={person.fullName} placeholder={L(language, 'Full legal name', '전체 법적 이름')}
            onChange={(e) => update(idx, { fullName: e.target.value })} />
          <Input value={person.relationship ?? ''} placeholder={L(language, 'Relationship', '관계')}
            onChange={(e) => update(idx, { relationship: e.target.value })} />
          <Input type="number" min={0} max={100} value={person.sharePercent ?? ''}
            aria-label={L(language, 'Share percentage', '지분 비율')}
            placeholder="%" onChange={(e) => update(idx, { sharePercent: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <RemoveButton onClick={() => onChange(value.filter((_, i) => i !== idx))} language={language} />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => onChange([...value, { id: crypto.randomUUID(), fullName: '' }])}>
        {L(language, '+ Add beneficiary', '+ 수혜자 추가')}
      </Button>
    </div>
  )
}

function GiftListEditor({
  value,
  onChange,
  language,
}: {
  value: VaultGift[]
  onChange: (next: VaultGift[]) => void
  language: Language
}) {
  const update = (idx: number, patch: Partial<VaultGift>) =>
    onChange(value.map((gift, i) => i === idx ? { ...gift, ...patch } : gift))
  return (
    <div className="space-y-3">
      {value.map((gift, idx) => (
        <div key={gift.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <select className="h-10 rounded-lg border border-gray-300 px-3 text-sm" value={gift.type}
              aria-label={L(language, 'Gift type', '유증 종류')}
              onChange={(e) => update(idx, { type: e.target.value as VaultGift['type'] })}>
              <option value="cash">{L(language, 'Cash', '현금')}</option>
              <option value="personal_item">{L(language, 'Personal item', '개인 물품')}</option>
              <option value="real_estate">{L(language, 'Real estate', '부동산')}</option>
              <option value="charity">{L(language, 'Charity', '자선단체')}</option>
              <option value="pet">{L(language, 'Pet care', '반려동물 돌봄')}</option>
            </select>
            <Input value={gift.description} placeholder={L(language, 'Describe the gift', '유증 설명')}
              onChange={(e) => update(idx, { description: e.target.value })} />
            <RemoveButton onClick={() => onChange(value.filter((_, i) => i !== idx))} language={language} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input value={gift.type === 'charity' ? gift.charityName ?? '' : gift.recipientName ?? ''}
              placeholder={gift.type === 'charity' ? L(language, 'Charity name', '자선단체명') : L(language, 'Recipient', '수령인')}
              onChange={(e) => update(idx, gift.type === 'charity' ? { charityName: e.target.value } : { recipientName: e.target.value })} />
            <Input type="number" min={0} value={gift.amount ?? ''} placeholder={L(language, 'Amount, if applicable', '금액 (해당 시)')}
              onChange={(e) => update(idx, { amount: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <Input value={gift.condition ?? ''} placeholder={L(language, 'Condition (optional)', '조건 (선택 사항)')}
              onChange={(e) => update(idx, { condition: e.target.value })} />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => onChange([...value, { id: crypto.randomUUID(), type: 'cash', description: '' }])}>
        {L(language, '+ Add gift', '+ 유증 추가')}
      </Button>
    </div>
  )
}

function AssetListEditor({
  value,
  onChange,
  language,
}: {
  value: VaultAssetItem[]
  onChange: (next: VaultAssetItem[]) => void
  language: Language
}) {
  const update = (idx: number, patch: Partial<VaultAssetItem>) =>
    onChange(value.map((asset, i) => i === idx ? { ...asset, ...patch } : asset))
  return (
    <div className="space-y-3">
      {value.map((asset, idx) => (
        <div key={asset.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <select className="h-10 rounded-lg border border-gray-300 px-3 text-sm" value={asset.type}
              aria-label={L(language, 'Asset type', '자산 종류')}
              onChange={(e) => update(idx, { type: e.target.value as VaultAssetItem['type'] })}>
              {[
                ['real_estate', 'Real estate', '부동산'], ['bank', 'Bank account', '은행 계좌'],
                ['investment', 'Investment', '투자'], ['registered_plan', 'RRSP/RRIF/TFSA', '등록 플랜'],
                ['insurance', 'Life insurance', '생명보험'], ['business', 'Business interest', '사업 지분'],
                ['foreign', 'Foreign property', '해외 재산'], ['digital', 'Digital asset', '디지털 자산'],
                ['other', 'Other', '기타'],
              ].map(([key, en, ko]) => <option key={key} value={key}>{L(language, en, ko)}</option>)}
            </select>
            <Input value={asset.description} placeholder={L(language, 'General description only', '일반적인 설명만 입력')}
              onChange={(e) => update(idx, { description: e.target.value })} />
            <RemoveButton onClick={() => onChange(value.filter((_, i) => i !== idx))} language={language} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input type="number" min={0} value={asset.estimatedValue ?? ''} placeholder={L(language, 'Approximate value', '대략적인 가치')}
              onChange={(e) => update(idx, { estimatedValue: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <select className="h-10 rounded-lg border border-gray-300 px-3 text-sm" value={asset.ownership ?? ''}
              aria-label={L(language, 'Ownership', '소유 형태')}
              onChange={(e) => update(idx, { ownership: (e.target.value || undefined) as VaultAssetItem['ownership'] })}>
              <option value="">{L(language, 'Ownership (optional)', '소유 형태 (선택)')}</option>
              <option value="sole">{L(language, 'Sole', '단독')}</option>
              <option value="joint_spouse">{L(language, 'Joint with spouse', '배우자와 공동')}</option>
              <option value="joint_other">{L(language, 'Joint with another person', '다른 사람과 공동')}</option>
              <option value="tenants_in_common">{L(language, 'Tenants in common', '공유 지분')}</option>
            </select>
            <Input value={asset.designatedBeneficiaryName ?? ''} placeholder={L(language, 'Named beneficiary (if any)', '지정 수혜자 (있는 경우)')}
              onChange={(e) => update(idx, { designatedBeneficiaryName: e.target.value, hasDesignatedBeneficiary: !!e.target.value })} />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => onChange([...value, { id: crypto.randomUUID(), type: 'real_estate', description: '' }])}>
        {L(language, '+ Add asset', '+ 자산 추가')}
      </Button>
    </div>
  )
}

function LiabilityListEditor({
  value,
  onChange,
  language,
}: {
  value: VaultLiability[]
  onChange: (next: VaultLiability[]) => void
  language: Language
}) {
  const update = (idx: number, patch: Partial<VaultLiability>) =>
    onChange(value.map((item, i) => i === idx ? { ...item, ...patch } : item))
  return (
    <div className="space-y-2">
      {value.map((item, idx) => (
        <div key={item.id} className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-[9rem_1fr_9rem_auto]">
          <select className="h-10 rounded-lg border border-gray-300 px-2 text-sm" value={item.type}
            aria-label={L(language, 'Debt type', '채무 종류')}
            onChange={(e) => update(idx, { type: e.target.value as VaultLiability['type'] })}>
            <option value="mortgage">{L(language, 'Mortgage', '모기지')}</option>
            <option value="credit">{L(language, 'Credit', '신용 채무')}</option>
            <option value="loan">{L(language, 'Loan', '대출')}</option>
            <option value="tax">{L(language, 'Tax', '세금')}</option>
            <option value="business">{L(language, 'Business', '사업 채무')}</option>
            <option value="other">{L(language, 'Other', '기타')}</option>
          </select>
          <Input value={item.description} placeholder={L(language, 'General description', '일반 설명')}
            onChange={(e) => update(idx, { description: e.target.value })} />
          <Input type="number" min={0} value={item.estimatedBalance ?? ''} placeholder={L(language, 'Balance', '잔액')}
            onChange={(e) => update(idx, { estimatedBalance: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <RemoveButton onClick={() => onChange(value.filter((_, i) => i !== idx))} language={language} />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => onChange([...value, { id: crypto.randomUUID(), type: 'mortgage', description: '' }])}>
        {L(language, '+ Add debt', '+ 채무 추가')}
      </Button>
    </div>
  )
}

function RemoveButton({ onClick, language }: { onClick: () => void; language: Language }) {
  return (
    <button type="button" onClick={onClick}
      className="min-h-10 rounded px-2 text-xs text-gray-500 hover:bg-red-50 hover:text-red-700"
      aria-label={L(language, 'Remove item', '항목 삭제')}>
      {L(language, 'Remove', '삭제')}
    </button>
  )
}
