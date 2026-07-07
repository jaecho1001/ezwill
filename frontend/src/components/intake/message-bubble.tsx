'use client'

import { cn } from '@/lib/utils'
import type { ChatRole } from '@/lib/api/intake-chat'
import { ToolCallRenderer } from './tool-call-renderer'

export type ChatToolCall = {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ChatTurn {
  id: string
  role: ChatRole
  text: string
  toolCalls?: ChatToolCall[]
  /** True while this is the actively-streaming assistant turn. */
  streaming?: boolean
}

export function MessageBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user'
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-[#1B2A4A] text-white'
            : 'border border-[#E8E4DF] bg-white text-gray-800'
        )}
      >
        {turn.text && <p className="whitespace-pre-wrap">{turn.text}</p>}
        {turn.toolCalls && turn.toolCalls.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {turn.toolCalls.map((tc) => (
              <ToolCallRenderer key={tc.id} call={tc} />
            ))}
          </div>
        )}
        {turn.streaming && (
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-[#1B2A4A]" aria-label="thinking" />
        )}
      </div>
    </div>
  )
}
