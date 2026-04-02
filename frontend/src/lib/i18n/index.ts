import { en } from './en'
import { ko } from './ko'
import type { Language } from '../types/will'

export type TranslationKey = keyof typeof en
export type Translations = typeof en

export const translations = { en, ko } as const

export function getTranslations(lang: Language): Translations {
  return translations[lang] as unknown as Translations
}
