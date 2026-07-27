'use client'

import { QuestionCard } from '@/components/intake/question-card'
import { questionError, shouldAsk, type IntakeChapter } from '@/lib/intake/will-intake-script'
import { getByPath } from '@/stores/will-vault-store'
import type { Language } from '@/lib/types/will'
import type { WillVault } from '@/types/will-vault'
import { localizeIntakeMessage } from '@/lib/intake/localize'

/** DOM id for a question's card, used to scroll/focus the first error (issue #79). */
export function intakeQuestionAnchorId(questionId: string): string {
  return `intake-q-${questionId}`
}

export function IntakeQuestionList({
  chapter,
  vault,
  language,
  showErrors,
  onChange,
}: {
  chapter: IntakeChapter
  vault: WillVault
  language: Language
  showErrors: boolean
  onChange: (path: string, value: unknown) => void
}) {
  return chapter.questions.filter((question) => shouldAsk(question, vault)).map((question) => (
    <div key={question.id} id={intakeQuestionAnchorId(question.id)}>
      <QuestionCard
        question={question}
        value={getByPath(vault, question.vaultPath)}
        onChange={(value) => onChange(question.vaultPath, value)}
        language={language}
        error={showErrors ? localizeIntakeMessage(language, questionError(question, vault)) : null}
      />
    </div>
  ))
}
