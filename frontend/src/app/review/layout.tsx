'use client'

import { useState } from 'react'

type Lang = 'en' | 'ko'

const text = {
  en: {
    portalTitle: 'EZWill -- Document Review',
    firmName: 'Vaturi & Cho LLP',
    footer:
      'This review portal is provided by your legal counsel. Questions? Contact your lawyer.',
    langLabel: 'EN',
  },
  ko: {
    portalTitle: 'EZWill -- 문서 검토',
    firmName: 'Vaturi & Cho LLP',
    footer:
      '이 검토 포털은 귀하의 법률 고문이 제공합니다. 질문이 있으시면 담당 변호사에게 연락해 주세요.',
    langLabel: 'KO',
  },
}

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('en')
  const t = text[lang]

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Top Bar */}
      <header className="border-b border-stone-200 bg-white shadow-sm">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Firm crest / logo placeholder */}
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-stone-800 text-white text-xs font-bold tracking-wide">
              V&C
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">{t.firmName}</p>
              <p className="text-xs text-stone-500">{t.portalTitle}</p>
            </div>
          </div>

          {/* Language toggle */}
          <button
            onClick={() => setLang(lang === 'en' ? 'ko' : 'en')}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50"
          >
            {lang === 'en' ? 'KO 한국어' : 'EN English'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          <p className="text-center text-xs text-stone-400">{t.footer}</p>
        </div>
      </footer>
    </div>
  )
}
