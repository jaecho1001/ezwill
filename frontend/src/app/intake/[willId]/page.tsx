'use client'

import { useCallback, useMemo, useState, use, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useWillVault } from '@/stores/will-vault-store'
import {
  willIntakeChapters,
  shouldAsk,
  chapterProgress,
  overallProgress,
  questionError,
} from '@/lib/intake/will-intake-script'
import { ChapterStepper } from '@/components/intake/chapter-stepper'
import { IntakeQuestionList, intakeQuestionAnchorId } from '@/components/intake/question-list'
import { ExtractedDataSidebar } from '@/components/intake/extracted-data-sidebar'
import { ChatPane } from '@/components/intake/chat-pane'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { L } from '@/lib/intake/localize'
import { resolveLink } from '@/lib/api/drafts'
import { useDraft } from '@/providers/draft-provider'
import { normalizeVault } from '@/types/will-vault'
import { useVaultSync } from '@/hooks/use-vault-sync'

export default function IntakePage({ params }: { params: Promise<{ willId: string }> }) {
  const { willId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const store = useWillVault(willId)
  const vault = store((s) => s.vault)
  const setField = store((s) => s.setField)
  const language = store((s) => s.language)
  const setLanguage = store((s) => s.setLanguage)
  const replaceVault = store((s) => s.replaceVault)
  const { setDraftId, setToken } = useDraft()
  const [linkError, setLinkError] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const hasMagicToken = Boolean(searchParams.get('t'))

  // On a 409 the server has a newer copy (another device, or the lawyer).
  // Re-hydrate from it rather than fighting over the draft (issue #92).
  const handleConflict = useCallback(() => {
    setHydrated(false)
  }, [])
  const { status: saveStatus, retry: retrySave, acceptRevision } = useVaultSync(
    vault, !hasMagicToken || hydrated, willId, handleConflict,
  )

  // A lawyer-created link is resolved again here so a bookmarked intake URL
  // can restore its server copy on another device.
  useEffect(() => {
    const magicToken = searchParams.get('t')
    if (!magicToken || hydrated) return
    void resolveLink(magicToken).then((result) => {
      if (!result || result.draft_id !== willId) {
        setLinkError(true)
        return
      }
      setDraftId(result.draft_id)
      setToken(magicToken)
      setLanguage(result.language)
      const [firstName = '', ...rest] = (result.client_name ?? '').split(' ')
      const serverVault = result.vault
        ? normalizeVault(result.vault as never)
        : normalizeVault(vault)
      replaceVault({
        ...serverVault,
        testator: {
          ...serverVault.testator,
          fullName: serverVault.testator.fullName || [firstName, ...rest].join(' ').trim(),
          // Contact prefill deliberately NOT sourced from the resolve
          // endpoint: it answers to a bare token, so it no longer returns
          // email/phone (issue #77). The client enters their own contact
          // details, and the vault carries them from then on.
        },
      })
      acceptRevision(result.revision)
      setHydrated(true)
    })
  }, [acceptRevision, hydrated, replaceVault, searchParams, setDraftId, setLanguage, setToken, vault, willId])

  // Seed the active chapter from ?chapter=N so deep-links from the summary
  // page / facts panel / external bookmarks land on the right step.
  const initialIdx = (() => {
    const raw = Number(searchParams.get('chapter'))
    if (!Number.isFinite(raw)) return 0
    return Math.max(0, Math.min(willIntakeChapters.length - 1, Math.trunc(raw)))
  })()
  const [chapterIdx, setChapterIdx] = useState(initialIdx)
  const [attemptedChapters, setAttemptedChapters] = useState<Set<string>>(() => new Set())
  const chapter = willIntakeChapters[chapterIdx]

  // Mode toggle — 'form' or 'chat'. Both modes share the same Zustand vault
  // so switching mid-session doesn't lose data. Sync with ?mode= query so
  // deep-links from outside the wizard (e.g. an email) land in the right UI.
  const modeParam = searchParams.get('mode')
  const mode: 'form' | 'chat' = modeParam === 'chat' ? 'chat' : 'form'
  const setMode = (next: 'form' | 'chat') => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'chat') params.set('mode', 'chat')
    else params.delete('mode')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  // Keep the URL in sync when the user navigates internally so browser
  // back/forward and refresh restore the active chapter. Use replace (not
  // push) so we don't flood history.
  useEffect(() => {
    const current = searchParams.get('chapter')
    if (current === String(chapterIdx)) return
    const next = new URLSearchParams(searchParams.toString())
    next.set('chapter', String(chapterIdx))
    router.replace(`?${next.toString()}`, { scroll: false })
  }, [chapterIdx, router, searchParams])

  // Only render questions whose skipIf doesn't kick in under the live vault.
  const visibleQuestions = useMemo(
    () => chapter.questions.filter((q) => shouldAsk(q, vault)),
    [chapter, vault]
  )

  const progressByChapter = useMemo(() => {
    const out: Record<string, ReturnType<typeof chapterProgress>> = {}
    for (const ch of willIntakeChapters) out[ch.id] = chapterProgress(ch, vault)
    return out
  }, [vault])

  const overall = useMemo(() => overallProgress(vault), [vault])

  // Back navigation stays unrestricted; only forward navigation validates.
  const goPrev = () => setChapterIdx((i) => Math.max(0, i - 1))
  // Shared forward gate (issue #79 review): the chapter STEPPER could jump
  // ahead without running the Next button's validation, so the two paths
  // now share it. Returns true when navigation may proceed.
  const validateCurrentChapter = () => {
    setAttemptedChapters((current) => new Set(current).add(chapter.id))
    const firstError = chapter.questions.find((q) => questionError(q, vault) !== null)
    if (firstError) {
      requestAnimationFrame(() => {
        const card = document.getElementById(intakeQuestionAnchorId(firstError.id))
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        card?.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true })
      })
      return false
    }
    return true
  }
  const selectChapter = (index: number) => {
    if (index <= chapterIdx || validateCurrentChapter()) setChapterIdx(index)
  }
  const goNext = () => {
    if (!validateCurrentChapter()) return
    setChapterIdx((i) => Math.min(willIntakeChapters.length - 1, i + 1))
  }
  const isLast = chapterIdx === willIntakeChapters.length - 1
  const canReview = overall.requiredUnanswered === 0

  if (linkError) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <h1 className="text-xl font-semibold text-[#1B2A4A]">{L(language, 'This link is no longer available', '이 링크는 더 이상 사용할 수 없습니다')}</h1>
        <p className="mt-2 text-sm text-gray-600">{L(language, 'Please ask your lawyer for a new questionnaire link.', '변호사에게 새 설문 링크를 요청해 주세요.')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      {/* Gradient progress bar + mode toggle */}
      <div className="rounded-xl border border-[#E8E4DF] bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-700">
            {L(language, 'Intake', '설문')} · {willIntakeChapters.length} {L(language, 'chapters', '장')}
          </span>
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => setMode('form')}
              className={cn(
                'px-3 py-1 rounded transition-colors',
                mode === 'form'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              📝 {L(language, 'Form', '양식')}
            </button>
            <button
              type="button"
              onClick={() => setMode('chat')}
              className={cn(
                'px-3 py-1 rounded transition-colors',
                mode === 'chat'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              💬 {L(language, 'Chat', '채팅')}
            </button>
          </div>
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={cn('px-2 py-1 rounded transition-colors', language === 'en' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('ko')}
              className={cn('px-2 py-1 rounded transition-colors', language === 'ko' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              한국어
            </button>
          </div>
          <span className="ml-auto text-gray-500">{overall.pct}% {L(language, 'complete', '완료')}</span>
          <button
            type="button"
            onClick={() => saveStatus === 'error' && void retrySave()}
            className={cn('text-xs', saveStatus === 'error' ? 'text-red-700 underline' : 'text-gray-500')}
            aria-live="polite"
          >
            {saveStatus === 'saving' && L(language, 'Saving…', '저장 중…')}
            {saveStatus === 'saved' && L(language, 'Saved', '저장됨')}
            {saveStatus === 'error' && L(language, 'Save failed — retry', '저장 실패 — 다시 시도')}
            {saveStatus === 'idle' && L(language, 'Answers save automatically', '답변은 자동 저장됩니다')}
          </button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-[#1B2A4A] to-[#7BA68C] transition-all"
            style={{ width: `${overall.pct}%` }}
          />
        </div>
        {!canReview && (
          <p className="mt-2 text-[11px] text-[#8a6a1e]">
            {language === 'ko'
              ? `${overall.requiredUnanswered}개의 필수 질문에 답해야 문서를 생성할 수 있습니다.`
              : `${overall.requiredUnanswered} required question${overall.requiredUnanswered === 1 ? '' : 's'} remaining before you can generate documents.`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left — stepper */}
        <aside className="col-span-12 md:col-span-3">
          <div className="sticky top-4 rounded-xl border border-[#E8E4DF] bg-white p-3 shadow-sm">
            <ChapterStepper
              chapters={willIntakeChapters}
              currentIndex={chapterIdx}
              progressByChapter={progressByChapter}
              onSelect={selectChapter}
              language={language}
            />
          </div>
        </aside>

        {/* Center — form questions OR chat pane */}
        <main className="col-span-12 space-y-3 md:col-span-9">
          {mode === 'chat' ? (
            <>
              <ChatPane
                willId={willId}
                onAdvanceChapter={(chapterId) => {
                  const idx = willIntakeChapters.findIndex((c) => c.id === chapterId)
                  if (idx >= 0) setChapterIdx(idx)
                }}
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <Link href={`/summary/${willId}`}>
                  <Button disabled={!canReview}>
                    {canReview
                      ? L(language, 'Review & continue →', '검토 후 계속 →')
                      : `${overall.requiredUnanswered} ${L(language, 'required left', '개 남음')}`}
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <header className="rounded-xl border border-[#E8E4DF] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none">{chapter.icon}</span>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{L(language, chapter.title, chapter.titleKo)}</h2>
                    <p className="mt-0.5 text-xs text-gray-500">{L(language, chapter.intro, chapter.introKo)}</p>
                  </div>
                </div>
              </header>

              {visibleQuestions.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-500">
                  {L(language, 'Nothing applies to you in this chapter — move on to the next.', '이 장에서 해당하는 항목이 없습니다 — 다음으로 넘어가세요.')}
                </div>
              )}

              <IntakeQuestionList
                chapter={chapter}
                vault={vault}
                language={language}
                showErrors={attemptedChapters.has(chapter.id)}
                onChange={setField}
              />

              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" onClick={goPrev} disabled={chapterIdx === 0}>
                  {L(language, 'Back', '이전')}
                </Button>
                {!isLast ? (
                  <Button onClick={goNext}>{L(language, 'Next chapter', '다음 장')}</Button>
                ) : (
                  <Link href={`/summary/${willId}`}>
                    <Button disabled={!canReview}>
                      {canReview
                        ? L(language, 'Review & continue →', '검토 후 계속 →')
                        : `${overall.requiredUnanswered} ${L(language, 'required left', '개 남음')}`}
                    </Button>
                  </Link>
                )}
                <span className="ml-auto text-xs text-gray-400">
                  {L(language, 'Chapter', '장')} {chapterIdx + 1} / {willIntakeChapters.length}
                </span>
              </div>
            </>
          )}
        </main>

      </div>

      <details className="rounded-xl border border-[#E8E4DF] bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-medium text-[#1B2A4A]">
          {L(language, 'Review what we have so far', '현재까지 입력한 내용 검토')}
        </summary>
        <div className="mt-4">
          <ExtractedDataSidebar vault={vault} onJumpTo={setChapterIdx} language={language} />
        </div>
      </details>
    </div>
  )
}
