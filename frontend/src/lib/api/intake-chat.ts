/**
 * SSE client for POST /api/ai/intake/chat. Uses fetch + ReadableStream so we
 * can POST the full conversation + vault in the request body (EventSource
 * is GET-only). Parses text/event-stream frames into typed callbacks.
 *
 * Cancellation is controlled via the AbortController the caller passes in —
 * aborting closes the fetch body reader cleanly and the generator terminates.
 */

import { getAuthHeaders } from '@/lib/auth'
import type { WillVault } from '@/types/will-vault'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export type IntakeStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'vault_patch_scalar'; path: string; value: unknown }
  | { type: 'vault_patch_list'; list_path: string; item: Record<string, unknown>; op: 'append' }
  | { type: 'advance'; chapter_id: string }
  | { type: 'clarify'; question: string }
  | { type: 'error'; message: string }
  | {
      type: 'done'
      tool_calls: number
      elapsed_ms: number
      source: 'claude' | 'mock'
      model?: string
      usage?: {
        input_tokens: number
        output_tokens: number
        cache_read_input_tokens: number
        cache_creation_input_tokens: number
      }
    }

export interface IntakeChatRequestBody {
  draftId: string
  magicToken?: string
  messages: ChatMessage[]
  vault: WillVault
  progressSummary?: string
}

/**
 * POST the request and stream events. Yields each parsed SSE frame as an
 * IntakeStreamEvent. Caller loops with `for await`.
 */
export async function* streamIntakeChat(
  body: IntakeChatRequestBody,
  signal: AbortSignal
): AsyncIterable<IntakeStreamEvent> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...getAuthHeaders(),
  }
  if (body.magicToken) {
    headers['X-Magic-Token'] = body.magicToken
  }

  const res = await fetch('/api/ai/intake/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      draft_id: body.draftId,
      messages: body.messages,
      vault: body.vault,
      progress_summary: body.progressSummary,
    }),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`intake chat stream failed: HTTP ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Split on SSE frame boundaries ("\n\n"). Keep trailing partial frame in buffer.
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const parsed = parseFrame(raw)
      if (parsed) yield parsed
    }
  }
  // Flush a final frame if the server closed without a trailing \n\n.
  if (buffer.trim()) {
    const parsed = parseFrame(buffer)
    if (parsed) yield parsed
  }
}

function parseFrame(raw: string): IntakeStreamEvent | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  let data: Record<string, unknown>
  try {
    data = JSON.parse(dataLines.join('\n'))
  } catch {
    return null
  }
  switch (event) {
    case 'text_delta':
      return { type: 'text_delta', text: String(data.text ?? '') }
    case 'tool_call':
      return {
        type: 'tool_call',
        id: String(data.id ?? ''),
        name: String(data.name ?? ''),
        input: (data.input as Record<string, unknown>) ?? {},
      }
    case 'vault_patch':
      if ('list_path' in data) {
        return {
          type: 'vault_patch_list',
          list_path: String(data.list_path),
          item: (data.item as Record<string, unknown>) ?? {},
          op: 'append',
        }
      }
      return {
        type: 'vault_patch_scalar',
        path: String(data.path),
        value: data.value,
      }
    case 'advance':
      return { type: 'advance', chapter_id: String(data.chapter_id ?? '') }
    case 'clarify':
      return { type: 'clarify', question: String(data.question ?? '') }
    case 'error':
      return { type: 'error', message: String(data.message ?? '') }
    case 'done': {
      const usage = (data.usage as Record<string, unknown> | undefined) ?? undefined
      return {
        type: 'done',
        tool_calls: Number(data.tool_calls ?? 0),
        elapsed_ms: Number(data.elapsed_ms ?? 0),
        source: (data.source === 'mock' ? 'mock' : 'claude') as 'claude' | 'mock',
        model: typeof data.model === 'string' ? data.model : undefined,
        usage: usage
          ? {
              input_tokens: Number(usage.input_tokens ?? 0),
              output_tokens: Number(usage.output_tokens ?? 0),
              cache_read_input_tokens: Number(usage.cache_read_input_tokens ?? 0),
              cache_creation_input_tokens: Number(usage.cache_creation_input_tokens ?? 0),
            }
          : undefined,
      }
    }
    default:
      return null
  }
}
