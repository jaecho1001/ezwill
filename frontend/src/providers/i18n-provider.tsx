'use client'
import * as React from 'react'
import { Language } from '@/lib/types/will'
import { getTranslations, Translations } from '@/lib/i18n'
import { useWillForm } from './will-form-provider'

interface I18nContextValue {
  lang: Language
  t: Translations
  setLanguage: (lang: Language) => void
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { will, dispatch } = useWillForm()
  const lang = will.language
  const t = getTranslations(lang)
  const setLanguage = (l: Language) => dispatch({ type: 'SET_LANGUAGE', payload: l })
  return <I18nContext.Provider value={{ lang, t, setLanguage }}>{children}</I18nContext.Provider>
}

export function useTranslation() {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider')
  return ctx
}
