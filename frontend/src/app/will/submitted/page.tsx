'use client'
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWillForm } from '@/providers/will-form-provider'
import { useTranslation } from '@/providers/i18n-provider'

export default function SubmittedPage() {
  const { will } = useWillForm()
  const { lang } = useTranslation()

  const firstName = will.aboutYou.legalFirstName || (lang === 'ko' ? '안녕하세요' : 'Hello')

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
              { icon: '📞', text: '변호사가 2영업일 이내에 연락하여 추가 질문을 할 수 있습니다.' },
              { icon: '📄', text: '유언장 및 위임장 서류를 준비합니다.' },
              { icon: '✍️', text: '직접 방문하여 2명의 증인과 함께 서류에 서명합니다. (SLRA 제4조)' },
            ] : [
              { icon: '📋', text: 'Your lawyer will review your answers.' },
              { icon: '📞', text: 'They may contact you within 2 business days with follow-up questions.' },
              { icon: '📄', text: 'Your Will and Powers of Attorney will be prepared.' },
              { icon: '✍️', text: 'You will sign your documents in person with 2 witnesses (SLRA s.4).' },
            ]).map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{step.icon}</span>
                <span className="text-sm text-gray-600">{step.text}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">
            {lang === 'ko' ? '중요: 온타리오 유언장 서명 요건' : 'Important: Ontario Will Signing Requirements'}
          </p>
          <p>
            {lang === 'ko'
              ? '온타리오에서 유언장은 반드시 직접 서명해야 합니다. 전자 서명은 허용되지 않습니다 (SLRA 제4조). 변호사가 서명 약속을 잡을 것입니다.'
              : 'In Ontario, Wills must be signed in person. Electronic signing is not permitted (SLRA s.4). Your lawyer will schedule a signing appointment.'}
          </p>
        </div>

        <div className="pt-2">
          <Link href="/">
            <Button variant="outline" className="w-full sm:w-auto">
              {lang === 'ko' ? '홈으로 돌아가기' : 'Return to Home'}
            </Button>
          </Link>
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
