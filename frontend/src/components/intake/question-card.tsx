'use client'

import { useId } from 'react'
import type { IntakeQuestion } from '@/lib/intake/will-intake-script'
import type { VaultChild, VaultPerson } from '@/types/will-vault'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface Props {
  question: IntakeQuestion
  value: unknown
  onChange: (value: unknown) => void
}

export function QuestionCard({ question, value, onChange }: Props) {
  const id = useId()
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-900">
        {question.prompt}
        {question.required && <span className="ml-1 text-amber-600">*</span>}
      </label>
      {question.helpText && (
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">{question.helpText}</p>
      )}
      <div className="mt-3">{renderInput(id, question, value, onChange)}</div>
    </div>
  )
}

function renderInput(
  id: string,
  q: IntakeQuestion,
  value: unknown,
  onChange: (v: unknown) => void
) {
  switch (q.kind) {
    case 'text':
      return (
        <Input
          id={id}
          value={(value as string) ?? ''}
          placeholder={q.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={(value as string) ?? ''}
          placeholder={q.placeholder}
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
          placeholder={q.placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )
    case 'boolean': {
      const bool = value as boolean | undefined
      return (
        <div className="flex gap-2">
          <ToggleChip selected={bool === true} onClick={() => onChange(true)}>Yes</ToggleChip>
          <ToggleChip selected={bool === false} onClick={() => onChange(false)}>No</ToggleChip>
          {bool !== undefined && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      )
    }
    case 'select':
      return (
        <select
          id={id}
          className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">— Select —</option>
          {q.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'personList':
      return <PersonListEditor value={(value as VaultPerson[]) ?? []} onChange={onChange} />
    case 'childList':
      return <ChildListEditor value={(value as VaultChild[]) ?? []} onChange={onChange} />
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
          ? 'border-amber-500 bg-amber-50 text-amber-800'
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
}: {
  value: VaultPerson[]
  onChange: (next: VaultPerson[]) => void
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
          No one added yet. Use the buttons below.
        </p>
      )}
      {value.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
          <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{ background: p.isBackup ? '#fef3c7' : '#dcfce7', color: p.isBackup ? '#92400e' : '#166534' }}>
            {p.isBackup ? 'Backup' : 'Primary'}
          </span>
          <Input
            className="h-8"
            value={p.fullName}
            placeholder="Full legal name"
            onChange={(e) => update(i, { fullName: e.target.value })}
          />
          <Input
            className="h-8 w-44"
            value={p.relationship ?? ''}
            placeholder="Relationship"
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
          + Primary
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => add(true)}>
          + Backup
        </Button>
      </div>
    </div>
  )
}

function ChildListEditor({
  value,
  onChange,
}: {
  value: VaultChild[]
  onChange: (next: VaultChild[]) => void
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
          No children added.
        </p>
      )}
      {value.map((c, i) => (
        <div key={c.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
          <Input
            className="h-8"
            value={c.fullName}
            placeholder="Full legal name"
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
            Prior relationship
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
        + Add child
      </Button>
    </div>
  )
}
