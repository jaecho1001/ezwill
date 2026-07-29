'use client'

import { LEGAL_STATEMENTS } from '@/lib/legal-statements'
import Link from 'next/link'
import { Bell, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'
import { useDraft } from '@/providers/draft-provider'

export default function SubmittedPage() {
  const { will } = useWillForm()
  const { lang } = useTranslation()
  const { draftId } = useDraft()

  const firstName = will.aboutYou.legalFirstName || (lang === 'ko' ? '안녕하세요' : 'Hello')
  // No ?t= on internal navigation (#91): the reminders page reads the
  // stored token from the draft provider, so the credential never
  // re-enters the address bar.
  const remindersHref = draftId ? `/reminders/${draftId}` : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-6">

        <div className="flex justify-center">
          <div className="rounded-full bg-green-100 p-6">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {lang === 'ko' ? `감사합니다, ${firstName}님.` : `Thank you, ${firstName}.`}
          </h1>
          <p className="text-gray-500 text-lg">
            {lang === 'ko'
              ? '유언장 질문지가 성공적으로 제출되었습니다.'
              : 'Your will questionnaire has been submitted successfully.'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-left space-y-4">
          <h2 className="font-semibold text-gray-900">
            {lang === 'ko' ? '다음 단계' : 'What happens next?'}
          </h2>
          <ol className="space-y-3">
            {(lang === 'ko' ? [
              { icon: '📋', text: '변호사가 귀하의 답변을 검토합니다.' },
              { icon: '📞', text: '변호사가 추가 질문을 위해 연락할 수 있습니다.' },
              { icon: '📄', text: '유언장 및 위임장 서류를 준비합니다.' },
              { icon: '✍️', text: LEGAL_STATEMENTS.documentsSignedInPerson.ko },
            ] : [
              { icon: '📋', text: 'Your lawyer will review your answers.' },
              { icon: '📞', text: 'They may contact you with follow-up questions.' },
              { icon: '📄', text: 'Your Will and Powers of Attorney will be prepared.' },
              { icon: '✍️', text: LEGAL_STATEMENTS.documentsSignedInPerson.en },
            ]).map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{step.icon}</span>
                <span className="text-sm text-gray-600">{step.text}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/40 rounded-xl p-4 text-sm text-[#8a6a1e]">
          <p className="font-semibold mb-1">
            {lang === 'ko' ? '중요: 온타리오 유언장 서명 요건' : 'Important: Ontario Will Signing Requirements'}
          </p>
          <p>
            {lang === 'ko'
              ? LEGAL_STATEMENTS.inPersonSigningNotice.ko
              : LEGAL_STATEMENTS.inPersonSigningNotice.en}
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
          {remindersHref && (
            <Button asChild className="w-full sm:w-auto">
              <Link href={remindersHref}>
                <Bell className="h-4 w-4" />
                {lang === 'ko' ? '검토 알림 설정' : 'Set Review Reminders'}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">
              {lang === 'ko' ? '홈으로 돌아가기' : 'Return to Home'}
            </Link>
          </Button>
        </div>

        <p className="text-xs text-gray-400">
          {lang === 'ko'
            ? '질문이 있으시면 사무실에 직접 문의해 주세요.'
            : "Questions? Contact your lawyer's office directly."}
        </p>
      </div>
    </div>
  )
}
