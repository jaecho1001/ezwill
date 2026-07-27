import type { Language } from '@/lib/types/will'

/**
 * Pick the language variant for an intake string. The conversational-intake
 * flow stores English + optional Korean siblings (promptKo, titleKo, ...) on
 * the question script; this returns the Korean when the client chose 'ko' and a
 * translation exists, otherwise the English fallback.
 */
export function L(lang: Language, en: string, ko?: string): string {
  return lang === 'ko' && ko ? ko : en
}

/**
 * Korean variants for validation messages produced by the intake script.
 * `validate` callbacks return English strings (they have no language
 * context); this table lets the renderer show the Korean sibling. Messages
 * without an entry fall back to English — extending coverage to the older
 * validation messages is a separate i18n pass.
 */
const INTAKE_MESSAGES_KO: Record<string, string> = {
  'Name each person before assigning their share.':
    '지분을 지정하기 전에 각 수혜자의 성함을 입력하십시오.',
}

export function localizeIntakeMessage(lang: Language, message: string | null): string | null {
  if (!message) return message
  return lang === 'ko' ? INTAKE_MESSAGES_KO[message] ?? message : message
}
