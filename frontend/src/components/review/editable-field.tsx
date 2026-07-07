'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

type FieldKind = 'text' | 'date' | 'number' | 'boolean'

interface Props {
  label: string
  value: string | number | boolean | undefined
  kind?: FieldKind
  placeholder?: string
  onSave: (next: string | number | boolean | undefined) => void
  /** Optional renderer override for read-mode (e.g. comma list). */
  display?: (value: Props['value']) => React.ReactNode
}

/**
 * Edit-in-place field. Rest state shows the value + a pencil icon on hover;
 * clicking the pencil reveals an inline input. Enter saves, Esc cancels.
 * Empty values render as a muted em-dash so the layout stays consistent.
 */
export function EditableField({ label, value, kind = 'text', placeholder, onSave, display }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(toInputString(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(toInputString(value))
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [editing, value])

  const commit = () => {
    const parsed = fromInputString(draft, kind)
    onSave(parsed)
    setEditing(false)
  }
  const cancel = () => {
    setDraft(toInputString(value))
    setEditing(false)
  }

  const rendered = display ? display(value) : renderReadValue(value, kind)
  const isEmpty = value === undefined || value === '' || value === null

  return (
    <div className="group flex items-start gap-3 border-b border-gray-50 px-3 py-2 last:border-b-0">
      <dt className="w-40 shrink-0 pt-1 text-xs font-medium text-gray-500">{label}</dt>
      <dd className="min-w-0 flex-1">
        {editing ? (
          kind === 'boolean' ? (
            <div className="flex gap-2">
              {(['true', 'false', ''] as const).map((opt) => (
                <button
                  key={opt || 'clear'}
                  type="button"
                  onClick={() => {
                    onSave(opt === '' ? undefined : opt === 'true')
                    setEditing(false)
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    draft === opt ? 'border-[#1B2A4A] bg-[#1B2A4A]/5 text-[#1B2A4A]' : 'border-gray-300 bg-white text-gray-700'
                  )}
                >
                  {opt === 'true' ? 'Yes' : opt === 'false' ? 'No' : 'Clear'}
                </button>
              ))}
            </div>
          ) : (
            <Input
              ref={inputRef}
              type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') cancel()
              }}
              onBlur={commit}
              className="h-8 text-sm"
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-[#1B2A4A]/5"
          >
            <span className={cn('min-w-0 flex-1 truncate', isEmpty ? 'text-gray-300' : 'text-gray-900')}>
              {isEmpty ? '—' : rendered}
            </span>
            <svg
              className="h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 013.536 3.536L12.536 16.536a2 2 0 01-.878.506l-3.316.948a.5.5 0 01-.62-.62l.948-3.316a2 2 0 01.506-.878z" />
            </svg>
          </button>
        )}
      </dd>
    </div>
  )
}

function renderReadValue(v: Props['value'], kind: FieldKind): React.ReactNode {
  if (v === undefined || v === null || v === '') return ''
  if (kind === 'boolean') return v ? 'Yes' : 'No'
  if (kind === 'number') return typeof v === 'number' ? v.toLocaleString() : String(v)
  return String(v)
}

function toInputString(v: Props['value']): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

function fromInputString(s: string, kind: FieldKind): Props['value'] {
  const trimmed = s.trim()
  if (trimmed === '') return undefined
  if (kind === 'number') {
    const n = Number(trimmed)
    return Number.isNaN(n) ? undefined : n
  }
  if (kind === 'boolean') return trimmed === 'true'
  return trimmed
}
