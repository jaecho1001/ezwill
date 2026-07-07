'use client'

import { cn } from '@/lib/utils'

type ToolCall = {
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Inline renderer for assistant tool calls. We show an icon + a compact
 * description so users see exactly what the agent is writing into the vault.
 * This matters for trust — opaque "extracting…" text would leave users
 * unsure whether the right fields were captured.
 */
export function ToolCallRenderer({ call }: { call: ToolCall }) {
  const { icon, title, detail } = describe(call)
  return (
    <div
      className={cn(
        'my-1 inline-flex items-center gap-2 rounded-md border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 px-2 py-1 text-[11px] text-[#1B2A4A]'
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="font-medium">{title}</span>
      {detail && <span className="text-[#1B2A4A]/70">· {detail}</span>}
    </div>
  )
}

function describe(call: ToolCall): { icon: string; title: string; detail?: string } {
  switch (call.name) {
    case 'write_vault_field': {
      const path = String(call.input.path ?? '')
      const value = call.input.value
      return {
        icon: '✍️',
        title: path,
        detail: renderValue(value),
      }
    }
    case 'append_vault_list_item': {
      const list = String(call.input.list_path ?? '')
      const item = call.input.item as Record<string, unknown> | undefined
      return {
        icon: '➕',
        title: `${list}[+]`,
        detail: item && typeof item.fullName === 'string' ? String(item.fullName) : undefined,
      }
    }
    case 'advance_chapter':
      return { icon: '→', title: `Moving on to ${String(call.input.chapter_id ?? '')}` }
    case 'ask_clarifying_question':
      return { icon: '❓', title: 'Asking clarifying question' }
    default:
      return { icon: '🔧', title: call.name }
  }
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 57) + '…' : v
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return v.toLocaleString()
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
