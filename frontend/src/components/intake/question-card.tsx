'use client'

import { useId } from 'react'
import type { IntakeQuestion } from '@/lib/intake/will-intake-script'
import type { VaultChild, VaultPerson } from '@/types/will-vault'
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
}

export function QuestionCard({ question, value, onChange, language }: Props) {
  const id = useId()
  return (
    <div className="rounded-xl border border-[#E8E4DF] bg-white p-5 shadow-sm">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-900">
        {L(language, question.prompt, question.promptKo)}
        {question.required && <span className="ml-1 text-[#C9A84C]">*</span>}
      </label>
      {question.helpText && (
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
          {L(language, question.helpText, question.helpTextKo)}
        </p>
      )}
      <div className="mt-3">{renderInput(id, question, value, onChange, language)}</div>
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
        <div key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
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
            className="h-8 w-44"
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
        <div key={c.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
          <Input
            className="h-8"
            value={c.fullName}
            placeholder={L(language, 'Full legal name', '전체 법적 이름')}
            onChange={(e) => update(i, { fullName: e.target.value })}
          />
          <Input
            className="h-8 w-36"
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
