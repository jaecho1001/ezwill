'use client'
import { useTranslation } from '@/providers/i18n-provider'

export function LanguageToggle() {
  const { lang, setLanguage } = useTranslation()
  return (
    <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-0.5">
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
          lang === 'en' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >EN</button>
      <button
        onClick={() => setLanguage('ko')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
          lang === 'ko' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >한국어</button>
    </div>
  )
}
