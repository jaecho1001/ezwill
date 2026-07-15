'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { use } from 'react'
import {
  getDocumentPreview,
  approveDocument,
  addComment,
  resolveReviewToken,
  type DocumentPreview,
  type PreviewClause,
  type ReviewData,
} from '@/lib/api/review'

const labels = {
  en: {
    backToList: 'Back to Documents',
    iUnderstand: 'I understand this section',
    addComment: 'Question / Comment',
    commentPlaceholder: 'Type your question or comment...',
    sendComment: 'Send',
    cancel: 'Cancel',
    approveDoc: 'Approve This Document',
    approveAll: 'Please check all sections before approving.',
    approving: 'Approving...',
    approved: 'Document Approved',
    approvedMsg: 'Thank you. This document has been approved.',
    backAfterApprove: 'Back to Documents',
    error: 'Could not load this document.',
    errorSub: 'Please try again or contact your lawyer.',
    loading: 'Loading document...',
    annotationLabel: 'Note from your lawyer',
    statuteLabel: 'Legal reference',
    commentSent: 'Comment sent. Your lawyer will be notified.',
    clauseOf: 'of',
    sectionsComplete: 'sections reviewed',
  },
  ko: {
    backToList: '\uBB38\uC11C \uBAA9\uB85D\uC73C\uB85C',
    iUnderstand: '\uC774 \uD56D\uBAA9\uC744 \uC774\uD574\uD588\uC2B5\uB2C8\uB2E4',
    addComment: '\uC9C8\uBB38 / \uC758\uACAC',
    commentPlaceholder: '\uC9C8\uBB38\uC774\uB098 \uC758\uACAC\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694...',
    sendComment: '\uBCF4\uB0B4\uAE30',
    cancel: '\uCDE8\uC18C',
    approveDoc: '\uC774 \uBB38\uC11C \uC2B9\uC778',
    approveAll: '\uC2B9\uC778\uD558\uAE30 \uC804\uC5D0 \uBAA8\uB4E0 \uD56D\uBAA9\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.',
    approving: '\uC2B9\uC778 \uC911...',
    approved: '\uBB38\uC11C \uC2B9\uC778 \uC644\uB8CC',
    approvedMsg: '\uAC10\uC0AC\uD569\uB2C8\uB2E4. \uC774 \uBB38\uC11C\uAC00 \uC2B9\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4.',
    backAfterApprove: '\uBB38\uC11C \uBAA9\uB85D\uC73C\uB85C',
    error: '\uBB38\uC11C\uB97C \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
    errorSub: '\uB2E4\uC2DC \uC2DC\uB3C4\uD558\uAC70\uB098 \uBCC0\uD638\uC0AC\uC5D0\uAC8C \uC5F0\uB77D\uD574 \uC8FC\uC138\uC694.',
    loading: '\uBB38\uC11C \uBD88\uB7EC\uC624\uB294 \uC911...',
    annotationLabel: '\uBCC0\uD638\uC0AC \uC548\uB0B4',
    statuteLabel: '\uBC95\uB839 \uCC38\uC870',
    commentSent: '\uC758\uACAC\uC774 \uC804\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBCC0\uD638\uC0AC\uC5D0\uAC8C \uC54C\uB9BC\uC774 \uC804\uC1A1\uB429\uB2C8\uB2E4.',
    clauseOf: '/',
    sectionsComplete: '\uD56D\uBAA9 \uAC80\uD1A0 \uC644\uB8CC',
  },
}

export default function DocumentReviewPage({
  params,
}: {
  params: Promise<{ documentType: string }>
}) {
  const { documentType } = use(params)
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    }>
      <DocumentReviewContent documentType={documentType} />
    </Suspense>
  )
}

function DocumentReviewContent({ documentType }: { documentType: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('t') || ''

  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [preview, setPreview] = useState<DocumentPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [checkedClauses, setCheckedClauses] = useState<Set<string>>(new Set())
  const [commentingClause, setCommentingClause] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [commentSentFor, setCommentSentFor] = useState<Set<string>>(new Set())
  const [approveState, setApproveState] = useState<'idle' | 'approving' | 'approved'>('idle')

  useEffect(() => {
    if (!token) {
      setError(true)
      setLoading(false)
      return
    }

    Promise.all([
      resolveReviewToken(token),
      getDocumentPreview('__from_token__', documentType, token),
    ]).then(([rd, pv]) => {
      if (rd) setReviewData(rd)

      // If preview fetch with placeholder failed, try with actual draft_id
      if (rd && !pv) {
        getDocumentPreview(rd.draft_id, documentType, token).then((pv2) => {
          if (pv2) {
            setPreview(pv2)
          } else {
            setError(true)
          }
          setLoading(false)
        })
      } else if (pv) {
        setPreview(pv)
        setLoading(false)
      } else {
        setError(true)
        setLoading(false)
      }
    })
  }, [token, documentType])

  const lang = reviewData?.language || 'en'
  const t = labels[lang]

  // Count only non-folder clauses for checkbox tracking
  const reviewableClauses = (preview?.clauses || []).filter((c) => !c.is_folder)
  const allChecked = reviewableClauses.length > 0 && reviewableClauses.every((c) => checkedClauses.has(c.clause_id))

  const handleToggleClause = useCallback((clauseId: string) => {
    setCheckedClauses((prev) => {
      const next = new Set(prev)
      if (next.has(clauseId)) {
        next.delete(clauseId)
      } else {
        next.add(clauseId)
      }
      return next
    })
  }, [])

  const handleSendComment = async () => {
    if (!commentingClause || !commentText.trim() || !reviewData) return
    setCommentSending(true)
    const ok = await addComment(reviewData.draft_id, documentType, commentingClause, commentText.trim(), token)
    setCommentSending(false)
    if (ok) {
      setCommentSentFor((prev) => new Set(prev).add(commentingClause))
      setCommentText('')
      setCommentingClause(null)
    }
  }

  const handleApprove = async () => {
    if (!allChecked || !reviewData) return
    setApproveState('approving')
    const ok = await approveDocument(reviewData.draft_id, documentType, token)
    setApproveState(ok ? 'approved' : 'idle')
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
        <p className="mt-4 text-sm text-stone-500">{labels.en.loading}</p>
      </div>
    )
  }

  if (error || !preview) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-stone-800">{labels.en.error}</h2>
        <p className="mt-1 text-sm text-stone-500">{labels.en.errorSub}</p>
        <button
          onClick={() => router.push(`/review?t=${token}`)}
          className="mt-6 rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-700"
        >
          {labels.en.backToList}
        </button>
      </div>
    )
  }

  // Approved state
  if (approveState === 'approved') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-stone-800">{t.approved}</h2>
        <p className="mt-1 text-sm text-stone-500">{t.approvedMsg}</p>
        <button
          onClick={() => router.push(`/review?t=${token}`)}
          className="mt-6 rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-700"
        >
          {t.backAfterApprove}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back button + title */}
      <div>
        <button
          onClick={() => router.push(`/review?t=${token}`)}
          className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          {t.backToList}
        </button>
        <h1 className="text-xl font-serif font-semibold text-stone-800">{preview.title}</h1>
      </div>

      {/* Progress indicator */}
      <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-600">
            {checkedClauses.size} {t.clauseOf} {reviewableClauses.length} {t.sectionsComplete}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{
              width: `${reviewableClauses.length > 0 ? (checkedClauses.size / reviewableClauses.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Clauses */}
      <div className="space-y-4">
        {(preview.clauses || []).map((clause) => (
          <ClauseBlock
            key={clause.clause_id}
            clause={clause}
            lang={lang}
            checked={checkedClauses.has(clause.clause_id)}
            onToggle={() => handleToggleClause(clause.clause_id)}
            isCommenting={commentingClause === clause.clause_id}
            onOpenComment={() => setCommentingClause(clause.clause_id)}
            onCloseComment={() => {
              setCommentingClause(null)
              setCommentText('')
            }}
            commentText={commentText}
            onCommentChange={setCommentText}
            onSendComment={handleSendComment}
            commentSending={commentSending}
            commentSent={commentSentFor.has(clause.clause_id)}
            t={labels[lang]}
          />
        ))}
      </div>

      {/* Approve button */}
      <div className="sticky bottom-0 rounded-lg border border-stone-200 bg-white p-4 shadow-lg">
        {!allChecked && (
          <p className="mb-2 text-center text-xs text-stone-400">{t.approveAll}</p>
        )}
        <button
          disabled={!allChecked || approveState === 'approving'}
          onClick={handleApprove}
          className={`w-full rounded-lg py-3 text-sm font-semibold transition-colors ${
            allChecked
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'cursor-not-allowed bg-stone-100 text-stone-400'
          }`}
        >
          {approveState === 'approving' ? t.approving : t.approveDoc}
        </button>
      </div>
    </div>
  )
}

function ClauseBlock({
  clause,
  lang,
  checked,
  onToggle,
  isCommenting,
  onOpenComment,
  onCloseComment,
  commentText,
  onCommentChange,
  onSendComment,
  commentSending,
  commentSent,
  t,
}: {
  clause: PreviewClause
  lang: 'en' | 'ko'
  checked: boolean
  onToggle: () => void
  isCommenting: boolean
  onOpenComment: () => void
  onCloseComment: () => void
  commentText: string
  onCommentChange: (v: string) => void
  onSendComment: () => void
  commentSending: boolean
  commentSent: boolean
  t: typeof labels.en
}) {
  const annotation = lang === 'ko' && clause.annotation_ko ? clause.annotation_ko : clause.annotation
  const hasAnnotation = !!annotation

  // Folder clauses render as section headers
  if (clause.is_folder) {
    return (
      <div className="pt-4">
        <h2 className="border-b border-stone-200 pb-2 text-lg font-serif font-semibold text-stone-800 uppercase tracking-wide">
          {clause.title}
        </h2>
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg border bg-white p-5 shadow-sm transition-all ${
        checked ? 'border-emerald-200 bg-emerald-50/30' : 'border-stone-200'
      }`}
    >
      {/* Clause title */}
      {clause.title && (
        <div className="mb-2 flex items-center gap-2">
          <h3 className="font-semibold text-stone-800">{clause.title}</h3>
          {hasAnnotation && (
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#C9A84C]/15 text-[#8a6a1e] text-xs cursor-help"
              title={annotation}
            >
              i
            </span>
          )}
        </div>
      )}

      {/* Clause text - serif font for legal document feel */}
      <div
        className="prose prose-stone prose-sm max-w-none font-serif leading-relaxed text-stone-700"
        dangerouslySetInnerHTML={{ __html: clause.html }}
      />

      {/* Annotation tooltip area */}
      {hasAnnotation && (
        <div className="mt-3 rounded-md bg-[#C9A84C]/10 border border-[#C9A84C]/40 p-3">
          <p className="text-xs font-medium text-[#8a6a1e]">{t.annotationLabel}</p>
          <p className="mt-1 text-xs text-[#8a6a1e]">{annotation}</p>
          {clause.statute && (
            <p className="mt-1 text-xs text-[#8a6a1e]/80">
              {t.statuteLabel}: {clause.statute}
            </p>
          )}
        </div>
      )}

      {/* Comment sent confirmation */}
      {commentSent && (
        <p className="mt-2 text-xs text-emerald-600">{t.commentSent}</p>
      )}

      {/* Actions row */}
      <div className="mt-4 flex items-center justify-between gap-3">
        {/* Checkbox */}
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-stone-600">{t.iUnderstand}</span>
        </label>

        {/* Comment button */}
        {!isCommenting && (
          <button
            onClick={onOpenComment}
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-50 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.862-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            {t.addComment}
          </button>
        )}
      </div>

      {/* Comment input area */}
      {isCommenting && (
        <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3">
          <textarea
            value={commentText}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder={t.commentPlaceholder}
            rows={3}
            className="w-full rounded-md border border-stone-200 bg-white p-2 text-sm text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={onCloseComment}
              className="rounded-md px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700"
            >
              {t.cancel}
            </button>
            <button
              onClick={onSendComment}
              disabled={!commentText.trim() || commentSending}
              className="rounded-md bg-stone-800 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {commentSending ? '...' : t.sendComment}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
