'use client'

// Lawyer follow-up questions inside the client questionnaire (#98).
// Open questions get an answer box; answered-but-unresolved ones stay
// visible read-only so the client can see what they sent; resolved
// questions never render here — they are the lawyer's record, not the
// client's to-do list.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { L } from '@/lib/intake/localize'
import { partitionClientQuestions, type ClientQuestion } from '@/lib/api/drafts'
import type { Language } from '@/lib/types/will'

interface ClientQuestionsCardProps {
  questions: ClientQuestion[]
  language: Language
  /** Sends the answer to the server; resolves true on success. */
  onAnswer: (questionId: string, answerText: string) => Promise<boolean>
}

export function ClientQuestionsCard({ questions, language, onAnswer }: ClientQuestionsCardProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { open, answered } = partitionClientQuestions(questions)
  if (open.length === 0 && answered.length === 0) return null

  const submit = async (questionId: string) => {
    const text = (drafts[questionId] ?? '').trim()
    if (!text) return
    setSendingId(questionId)
    setErrors((prev) => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
    const ok = await onAnswer(questionId, text)
    if (ok) {
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[questionId]
        return next
      })
    } else {
      setErrors((prev) => ({
        ...prev,
        [questionId]: L(
          language,
          'Could not send your answer. Please try again.',
          '답변을 보내지 못했습니다. 다시 시도해 주세요.',
        ),
      }))
    }
    setSendingId(null)
  }

  return (
    <section className="rounded-xl border border-[#C9A84C] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none">✉️</span>
        <div>
          <h2 className="text-lg font-semibold text-[#1B2A4A]">
            {L(language, 'Your lawyer has a question', '변호사가 확인 질문을 보냈습니다')}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {L(
              language,
              'Please answer below — your lawyer needs this information to complete your documents.',
              '아래에 답변해 주세요 — 문서를 완성하려면 변호사에게 이 정보가 필요합니다.',
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {open.map((question) => (
          <div key={question.id} className="rounded-lg border border-[#E8E4DF] bg-[#FAF8F5] p-4">
            <p className="whitespace-pre-wrap text-sm font-medium text-gray-900">{question.question_text}</p>
            <textarea
              value={drafts[question.id] ?? ''}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [question.id]: e.target.value }))}
              rows={3}
              placeholder={L(language, 'Type your answer here', '여기에 답변을 입력해 주세요')}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void submit(question.id)}
                disabled={sendingId === question.id || !(drafts[question.id] ?? '').trim()}
              >
                {sendingId === question.id
                  ? L(language, 'Sending…', '보내는 중…')
                  : L(language, 'Send answer', '답변 보내기')}
              </Button>
              {errors[question.id] && <p className="text-xs text-red-600">{errors[question.id]}</p>}
            </div>
          </div>
        ))}

        {answered.map((question) => (
          <div key={question.id} className="rounded-lg border border-[#E8E4DF] bg-white p-4">
            <p className="whitespace-pre-wrap text-sm font-medium text-gray-700">{question.question_text}</p>
            <div className="mt-2 rounded-md bg-[#FAF8F5] px-3 py-2">
              <p className="text-xs font-medium text-gray-500">{L(language, 'Your answer', '보내신 답변')}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-800">{question.answer_text}</p>
            </div>
            <p className="mt-2 text-xs font-medium text-[#7BA68C]">
              {L(language, 'Answered — your lawyer will review', '답변 완료 — 변호사가 검토합니다')}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
