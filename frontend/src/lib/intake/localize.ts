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
