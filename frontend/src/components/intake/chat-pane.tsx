'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useWillVault } from '@/stores/will-vault-store'
import { useDraft } from '@/providers/draft-provider'
import {
  streamIntakeChat,
  type ChatMessage,
  type IntakeStreamEvent,
} from '@/lib/api/intake-chat'
import { extractFromMessage, type MockPatch } from '@/lib/intake/mock-extractor'
import { willIntakeChapters, overallProgress } from '@/lib/intake/will-intake-script'
import { Button } from '@/components/ui/button'
import { MessageBubble, type ChatTurn } from './message-bubble'
import type { VaultChild, VaultPerson, VaultBeneficiary, WillVault } from '@/types/will-vault'

interface Props {
  willId: string
  onAdvanceChapter?: (chapterId: string) => void
}

/**
 * Conversational intake pane. Streams SSE events from the backend, applies
 * vault patches to the Zustand store as they arrive, and transparently
 * falls back to a local regex extractor if the SSE request fails (network
 * error, API key missing, etc). The user never sees a broken flow.
 */
export function ChatPane({ willId, onAdvanceChapter }: Props) {
  const store = useWillVault(willId)
  const vault = store((s) => s.vault)
  const setField = store((s) => s.setField)
  const { token } = useDraft()

  const [turns, setTurns] = useState<ChatTurn[]>(() => [
    {
      id: 'seed-assistant',
      role: 'assistant',
      text: "Hi — I'm your intake assistant. Tell me about yourself in plain English and I'll fill out your will vault. Example: \"I'm Jane Doe, married to Alex, two kids Sam and Riley, I want Alex as my executor.\"",
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [source, setSource] = useState<'claude' | 'mock' | null>(null)
  const [lastUsage, setLastUsage] = useState<{ input: number; output: number; model?: string } | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  // Keep the scroller pinned to bottom on new content.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [turns])

  const handleVaultPatch = useCallback(
    (event: IntakeStreamEvent) => {
      if (event.type === 'vault_patch_scalar') {
        setField(event.path, event.value)
      } else if (event.type === 'vault_patch_list') {
        // Append to the list. Read current value, push, write back — the
        // store's dot-path setter handles the intermediate structure.
        const current = (store.getState().vault as unknown as Record<string, unknown>)[event.list_path]
        const list = Array.isArray(current) ? [...current] : []
        list.push(event.item)
        setField(event.list_path, list)
      }
    },
    [setField, store]
  )

  const applyMockPatches = useCallback(
    (patches: MockPatch[]) => {
      for (const p of patches) {
        if (p.kind === 'scalar') {
          setField(p.path, p.value)
        } else {
          const current = (store.getState().vault as unknown as Record<string, unknown>)[p.list_path]
          const list = Array.isArray(current) ? [...current] : []
          list.push(p.item)
          setField(p.list_path, list)
        }
      }
    },
    [setField, store]
  )

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setLastError(null)

    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
    }
    const assistantId = `asst-${Date.now()}`
    const assistantTurn: ChatTurn = {
      id: assistantId,
      role: 'assistant',
      text: '',
      toolCalls: [],
      streaming: true,
    }
    setTurns((prev) => [...prev, userTurn, assistantTurn])

    const fullMessages: ChatMessage[] = [
      ...turns.filter((t) => t.role === 'user' || t.role === 'assistant').map((t) => ({
        role: t.role,
        content: t.text,
      })),
      { role: 'user', content: text },
    ]

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const applyAssistantPatch = (patch: Partial<ChatTurn>) =>
      setTurns((prev) => prev.map((t) => (t.id === assistantId ? { ...t, ...patch } : t)))

    const appendText = (delta: string) =>
      setTurns((prev) => prev.map((t) => (t.id === assistantId ? { ...t, text: t.text + delta } : t)))

    const appendToolCall = (call: NonNullable<ChatTurn['toolCalls']>[number]) =>
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId
            ? { ...t, toolCalls: [...(t.toolCalls ?? []), call] }
            : t
        )
      )

    try {
      const progressSummary = buildProgressSummary(vault)
      let sawAnyFrame = false
      for await (const event of streamIntakeChat(
        {
          draftId: willId,
          magicToken: token ?? undefined,
          messages: fullMessages,
          vault,
          progressSummary,
        },
        ctrl.signal
      )) {
        sawAnyFrame = true
        switch (event.type) {
          case 'text_delta':
            appendText(event.text)
            break
          case 'tool_call':
            appendToolCall({ id: event.id, name: event.name, input: event.input })
            break
          case 'vault_patch_scalar':
          case 'vault_patch_list':
            handleVaultPatch(event)
            break
          case 'advance':
            if (onAdvanceChapter) onAdvanceChapter(event.chapter_id)
            break
          case 'clarify':
            appendText(`\n\n${event.question}`)
            break
          case 'error':
            setLastError(event.message)
            break
          case 'done':
            setSource(event.source)
            if (event.usage) {
              setLastUsage({
                input: event.usage.input_tokens,
                output: event.usage.output_tokens,
                model: event.model,
              })
            }
            break
        }
      }
      if (!sawAnyFrame) throw new Error('empty stream')
    } catch (err) {
      const error = err as Error
      if (error.name !== 'AbortError') {
        // An auth failure (401/403) means the session expired or the magic
        // link isn't bound to this draft. Surface it instead of silently
        // degrading to the offline extractor, which would hide a broken link
        // behind plausible-looking mock output.
        if (/HTTP 40[13]\b/.test(error.message)) {
          const msg =
            'Your session or secure link is no longer valid for this file. Please reopen your link to continue.'
          appendText(`\n\n${msg}`)
          setLastError(msg)
        } else {
          // Graceful degrade: regex extractor on the client.
          const { patches, assistantText } = extractFromMessage(text, vault)
          applyMockPatches(patches)
          appendText(
            (sawErrorBanner(lastError) ? '' : 'Network issue — using offline pattern matcher. ') + assistantText
          )
          setSource('mock')
          setLastError(error.message)
        }
      }
    } finally {
      applyAssistantPatch({ streaming: false })
      setSending(false)
      abortRef.current = null
    }
  }, [input, sending, turns, vault, handleVaultPatch, applyMockPatches, willId, token, onAdvanceChapter, lastError])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[520px] flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5">
        <span className="text-lg">💬</span>
        <h3 className="text-sm font-semibold text-gray-900">Chat intake</h3>
        <div className="ml-auto flex items-center gap-2">
          {lastUsage && source === 'claude' && (
            <span
              className="text-[10px] text-gray-400"
              title={`model: ${lastUsage.model ?? 'unknown'}`}
            >
              {lastUsage.input.toLocaleString()} in / {lastUsage.output.toLocaleString()} out
            </span>
          )}
          {source && (
            <span
              className={
                'rounded-full px-2 py-0.5 text-[10px] font-medium ' +
                (source === 'claude'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-800')
              }
            >
              {source === 'claude' ? 'Claude' : 'Offline · pattern matcher'}
            </span>
          )}
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.map((t) => (
          <MessageBubble key={t.id} turn={t} />
        ))}
      </div>

      <footer className="border-t border-gray-100 bg-gray-50 p-3">
        {lastError && (
          <p className="mb-2 text-[11px] text-amber-700">{lastError}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void sendMessage()
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendMessage()
              }
            }}
            placeholder="Type an answer… (Shift+Enter for newline)"
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
            disabled={sending}
          />
          {sending ? (
            <Button type="button" variant="outline" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()}>
              Send
            </Button>
          )}
        </form>
        <p className="mt-1.5 text-[10px] text-gray-400">
          {overallProgress(vault).pct}% of intake filled · {willIntakeChapters.length} chapters
        </p>
      </footer>
    </div>
  )
}

function sawErrorBanner(err: string | null): boolean {
  return !!err && err !== ''
}

function buildProgressSummary(vault: WillVault): string {
  const lines: string[] = []
  for (const ch of willIntakeChapters) {
    const filled = ch.questions
      .map((q) => {
        const value = q.vaultPath
          .split('.')
          .reduce<unknown>((acc, key) => (acc == null ? acc : (acc as Record<string, unknown>)[key]), vault as unknown)
        return { q: q.id, hasValue: isFilled(value) }
      })
    const nAsked = filled.length
    const nAnswered = filled.filter((f) => f.hasValue).length
    lines.push(`- ${ch.id}: ${nAnswered}/${nAsked}`)
  }
  return lines.join('\n')
}

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return (v as Array<VaultChild | VaultPerson | VaultBeneficiary>).length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}
