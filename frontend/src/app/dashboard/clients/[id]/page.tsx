'use client'

import { useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { AiFlagsSummary } from '@/components/dashboard/ai-flags-summary'
import { EstateOverview } from '@/components/dashboard/estate-overview'
import {
  getDraft,
  createReviewLink,
  invokeQuickDraft,
  askClientQuestion,
  listClientQuestions,
  resolveClientQuestion,
  type QuickDraftResult,
  type ClientQuestion,
} from '@/lib/api/drafts'
import { getAuthHeaders } from '@/lib/auth'
import { affirmedPersonalCareClauseIds, mergeSelectionsWithDefaults, supportedConditionalClauseIds, willDocumentTypes } from '@/lib/will-documents/index'
import { serializeSelectionsForSave } from '@/lib/will-documents/clause-serialization'
import type { WillDocumentType } from '@/types/will-document'
import { cn } from '@/lib/utils'
import { normalizeVault } from '@/types/will-vault'
import { overallProgress } from '@/lib/intake/will-intake-script'
import { getVaultReviewFlags } from '@/lib/intake/vault-review-flags'

const SECTION_LABELS = [
  { key: 'about_you', label: 'About You' },
  { key: 'your_family', label: 'Family' },
  { key: 'your_estate', label: 'Estate' },
  { key: 'your_arrangements', label: 'Arrangements' },
  { key: 'poa_property', label: 'POA — Property' },
  { key: 'poa_personal_care', label: 'POA — Personal Care' },
  { key: 'assets', label: 'Assets' },
  { key: 'vault', label: 'Unified Client Intake' },
]

function SectionData({ label, data }: { label: string; data: unknown }) {
  if (!data || (typeof data === 'object' && Object.keys(data as object).length === 0)) {
    return (
      <div>
        <h4 className="text-sm font-medium text-gray-500">{label}</h4>
        <p className="mt-1 text-sm text-gray-300 italic">Not started</p>
      </div>
    )
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <div>
          <h4 className="text-sm font-medium text-gray-500">{label}</h4>
          <p className="mt-1 text-sm text-gray-300 italic">None added</p>
        </div>
      )
    }
    return (
      <div>
        <h4 className="text-sm font-medium text-gray-500">{label}</h4>
        <div className="mt-1 space-y-1">
          {data.map((item, idx) => (
            <div key={idx} className="rounded border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {typeof item === 'object' ? JSON.stringify(item, null, 0).slice(0, 200) : String(item)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const obj = data as Record<string, unknown>
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-500">{label}</h4>
      <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1">
        {Object.entries(obj).map(([key, val]) => {
          if (val === null || val === undefined || val === '') return null
          return (
            <div key={key} className="flex items-start gap-2 text-sm">
              <span className="text-gray-400">{key.replace(/_/g, ' ')}:</span>
              <span className="whitespace-pre-wrap break-words text-gray-700">
                {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface DraftDetail {
  id: string
  client_first_name: string
  client_last_name: string
  client_email: string | null
  client_phone: string | null
  status: string
  language: string
  current_step: number
  completed_steps: number[]
  submitted_at: string | null
  updated_at: string
  created_at: string
  about_you?: Record<string, unknown>
  your_family?: Record<string, unknown>
  your_estate?: Record<string, unknown>
  your_arrangements?: Record<string, unknown>
  poa_property?: Record<string, unknown>
  poa_personal_care?: Record<string, unknown>
  assets?: unknown[]
  people?: unknown[]
  ai_flags?: Array<{
    id: string
    severity: string
    title: string
    description: string
    statute?: string
    dismissed?: boolean
  }>
  tier2_clauses?: Record<string, unknown> | null
  vault?: Record<string, unknown> | null
}

// Follow-up questions (#98): status chip styling per lifecycle state.
const QUESTION_STATUS_BADGE: Record<ClientQuestion['status'], { label: string; variant: 'warning' | 'info' | 'success' }> = {
  open: { label: 'Open', variant: 'warning' },
  answered: { label: 'Answered', variant: 'info' },
  resolved: { label: 'Resolved', variant: 'success' },
}

// Scoping options for a question: the will/POA documents (not affidavits —
// those never carry client-facing decisions of their own).
const QUESTION_DOC_OPTIONS = willDocumentTypes.filter((t) => !t.id.startsWith('affidavit'))

function questionDocLabel(docType: string | null): string | null {
  if (!docType) return null
  return willDocumentTypes.find((t) => t.id === docType)?.shortName ?? docType
}

type TabId = 'overview' | 'answers' | 'documents' | 'tier2'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'answers', label: 'Questionnaire Answers' },
  { id: 'documents', label: 'Documents' },
  { id: 'tier2', label: 'Will Editor' },
]

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [draft, setDraft] = useState<DraftDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [reviewLink, setReviewLink] = useState<string | null>(null)
  const [reviewLinkLoading, setReviewLinkLoading] = useState(false)
  const [reviewLinkCopied, setReviewLinkCopied] = useState(false)
  const [reviewDeliveryStatus, setReviewDeliveryStatus] = useState<{ email: string; sms: string } | null>(null)
  const [reviewSendEmail, setReviewSendEmail] = useState(true)
  const [reviewSendSms, setReviewSendSms] = useState(true)
  const [aiDrafting, setAiDrafting] = useState(false)
  const [aiDraftResult, setAiDraftResult] = useState<QuickDraftResult | null>(null)
  const [aiDraftError, setAiDraftError] = useState<string | null>(null)
  // Follow-up questions (#98)
  const [questions, setQuestions] = useState<ClientQuestion[]>([])
  const [questionText, setQuestionText] = useState('')
  const [questionRequired, setQuestionRequired] = useState(false)
  const [questionDocType, setQuestionDocType] = useState('')
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({})
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolveErrors, setResolveErrors] = useState<Record<string, string>>({})
  // Questionnaire-link resend (#88)
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<string | null>(null)

  const handleResendLink = useCallback(async () => {
    setResending(true)
    setResendStatus(null)
    try {
      const res = await fetch(`/api/links/${id}/resend?send_email=true`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.email_delivery === 'sent') {
        setResendStatus('Sent')
      } else if (res.ok) {
        // Honest statuses (#88): 'logged_only' means email is not
        // configured on this server; never claim success.
        setResendStatus(body?.email_delivery === 'logged_only'
          ? 'Not sent — email is not configured on this server'
          : 'Not sent — delivery failed')
      } else {
        setResendStatus(body?.detail?.message ?? 'Not sent — no active link')
      }
    } catch {
      setResendStatus('Not sent — could not reach the server')
    } finally {
      setResending(false)
    }
  }, [id])

  const handleSendReviewLink = useCallback(async () => {
    setReviewLinkLoading(true)
    setReviewDeliveryStatus(null)
    try {
      const result = await createReviewLink(id, {
        send_email: reviewSendEmail,
        send_sms: reviewSendSms,
      })
      if (result) {
        const url = `${window.location.origin}/review?t=${result.token}`
        setReviewLink(url)
        setReviewDeliveryStatus({
          email: result.email_delivery ?? (result.email_sent ? 'sent' : 'failed'),
          sms: result.sms_delivery ?? (result.sms_sent ? 'sent' : 'failed'),
        })
      }
    } finally {
      setReviewLinkLoading(false)
    }
  }, [id, reviewSendEmail, reviewSendSms])

  const handleCopyReviewLink = useCallback(() => {
    if (reviewLink) {
      navigator.clipboard.writeText(reviewLink)
      setReviewLinkCopied(true)
      setTimeout(() => setReviewLinkCopied(false), 2000)
    }
  }, [reviewLink])

  const handleAiDraft = useCallback(async () => {
    if (!draft) return
    setAiDrafting(true)
    setAiDraftResult(null)
    setAiDraftError(null)
    try {
      const d = draft as unknown as Record<string, unknown>
      const clientData: Record<string, unknown> = {
        client_first_name: draft.client_first_name,
        client_last_name: draft.client_last_name,
        about_you: d.about_you,
        your_family: d.your_family,
        your_estate: d.your_estate,
        your_arrangements: d.your_arrangements,
        poa_property: d.poa_property,
        poa_personal_care: d.poa_personal_care,
        assets: d.assets,
        people: d.people,
        vault: d.vault,
      }
      const result = await invokeQuickDraft(id, clientData)
      if (result) {
        // The engine enables the recommended documents; persist default clause
        // selections for each so the Will Editor opens populated and the docs
        // can generate immediately.
        const docTypes = result.saved_document_types ?? result.document_types ?? []
        const saveResults = await Promise.all(
          docTypes.map(async (dt) => {
            // #84: defaults must respect the client's data — the raw set
            // includes gift/Henson/RESP clauses nothing can fill, and rows
            // saved here would permanently override the data filter.
            const draftRec = draft as unknown as Record<string, unknown>
            const clauses = mergeSelectionsWithDefaults(
              dt as WillDocumentType, [],
              affirmedPersonalCareClauseIds(draftRec),
              supportedConditionalClauseIds(draftRec),
            )
            if (clauses.length === 0) return true
            try {
              const r = await fetch(`/api/drafts/${id}/clauses/${dt}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ clauses: serializeSelectionsForSave(clauses) }),
              })
              return r.ok
            } catch {
              return false
            }
          }),
        )
        if (saveResults.every(Boolean)) {
          setAiDraftResult(result)
        } else {
          setAiDraftError('AI recommended documents, but some clause selections failed to save. Please retry.')
        }
      } else {
        setAiDraftError('AI draft failed. Please try again.')
      }
    } finally {
      setAiDrafting(false)
    }
  }, [id, draft])

  useEffect(() => {
    getDraft(id)
      .then((res) => {
        if (!res) {
          setError('Draft not found')
          return
        }
        setDraft(res as unknown as DraftDetail)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // Follow-up questions load alongside the draft (#98). A failed load
    // leaves the list empty rather than blocking the page.
    void listClientQuestions(id).then((loaded) => {
      if (loaded) setQuestions(loaded)
    })
  }, [id])

  const handleAskQuestion = useCallback(async () => {
    const text = questionText.trim()
    if (!text) return
    setAsking(true)
    setAskError(null)
    const created = await askClientQuestion(id, {
      question_text: text,
      required: questionRequired,
      document_type: questionDocType || undefined,
    })
    if (created) {
      setQuestions((prev) => [created, ...prev])
      setQuestionText('')
      setQuestionRequired(false)
      setQuestionDocType('')
    } else {
      setAskError('Could not send the question. Please try again.')
    }
    setAsking(false)
  }, [id, questionText, questionRequired, questionDocType])

  const handleResolveQuestion = useCallback(async (questionId: string) => {
    setResolvingId(questionId)
    setResolveErrors((prev) => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
    const note = (resolveNotes[questionId] ?? '').trim()
    const resolved = await resolveClientQuestion(id, questionId, note || undefined)
    if (resolved) {
      setQuestions((prev) => prev.map((q) => (q.id === questionId ? resolved : q)))
      setResolveNotes((prev) => {
        const next = { ...prev }
        delete next[questionId]
        return next
      })
    } else {
      setResolveErrors((prev) => ({
        ...prev,
        [questionId]: 'Could not mark this question resolved. Please try again.',
      }))
    }
    setResolvingId(null)
  }, [id, resolveNotes])

  const handleNavigate = useCallback((section: string) => {
    if (section === 'documents') {
      router.push(`/dashboard/clients/${id}/documents`)
    } else if (section === 'tier2') {
      router.push(`/dashboard/clients/${id}/tier2`)
    } else {
      // Switch to answers tab and scroll to section
      setActiveTab('answers')
    }
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B2A4A] border-t-transparent" />
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Clients
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || 'Draft not found'}
        </div>
      </div>
    )
  }

  const unifiedProgress = draft.vault ? overallProgress(normalizeVault(draft.vault as never)).pct : null
  const progress = unifiedProgress ?? Math.round((draft.completed_steps.length / 7) * 100)

  // Map ai_flags to the format AiFlagsSummary expects
  const flags = (draft.ai_flags ?? [])
    .filter((f) => !f.dismissed)
    .map((f) => ({
      id: f.id,
      rule: f.title,
      severity: f.severity as 'warning' | 'critical',
      message: f.description,
      field: f.statute,
    }))
  if (draft.vault) {
    for (const flag of getVaultReviewFlags(normalizeVault(draft.vault as never))) {
      if (!flags.some((existing) => existing.id === flag.id)) {
        flags.push({
          id: flag.id,
          rule: flag.title,
          severity: flag.severity,
          message: flag.description,
          field: flag.statute,
        })
      }
    }
  }

  const reviewComments = ((draft as unknown as Record<string, unknown>).review_comments ?? []) as Array<{
    id?: string; document_type: string; clause_id: string; comment_text: string;
    commenter_name?: string; created_at?: string;
  }>

  // Build section data map
  const sectionData: Record<string, unknown> = {
    about_you: draft.about_you,
    your_family: draft.your_family,
    your_estate: draft.your_estate,
    your_arrangements: draft.your_arrangements,
    poa_property: draft.poa_property,
    poa_personal_care: draft.poa_personal_care,
    assets: draft.assets,
    vault: draft.vault,
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Clients
      </Link>

      {/* Client Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {draft.client_first_name} {draft.client_last_name}
          </h2>
          <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
            {draft.client_email && <span>{draft.client_email}</span>}
            {draft.client_phone && <span>{draft.client_phone}</span>}
            <Badge variant="secondary" className="uppercase text-xs">{draft.language}</Badge>
            {(() => {
              const p = draft as unknown as { payment_status?: string; payment_tier?: string }
              const ps = p.payment_status || 'unpaid'
              const cls = ps === 'paid' ? 'bg-[#7BA68C]/15 text-[#5f8a70]' : ps === 'pending' ? 'bg-[#C9A84C]/15 text-[#8a6a1e]' : 'bg-gray-100 text-gray-500'
              const label = ps === 'paid' ? `Paid${p.payment_tier ? ' · ' + p.payment_tier : ''}` : ps === 'pending' ? 'Payment pending' : 'Unpaid'
              return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>{label}</span>
            })()}
          </div>
        </div>
        <StatusBadge status={draft.status} />
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Intake Progress</span>
            <span className="text-gray-500">
              {progress}%{unifiedProgress === null ? ` — Step ${draft.current_step + 1} of 7` : ' of required answers'}
            </span>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#1B2A4A] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {unifiedProgress === null && <div className="mt-2 flex justify-between text-xs text-gray-400">
            {SECTION_LABELS.filter((section) => section.key !== 'vault').map((s, i) => (
              <span
                key={s.key}
                className={draft.completed_steps.includes(i) ? 'text-[#7BA68C] font-medium' : ''}
              >
                {s.label}
              </span>
            ))}
          </div>}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleAiDraft} disabled={aiDrafting} className="bg-[#C9A84C] text-white hover:bg-[#b8973f]">
          {aiDrafting ? (
            <svg className="mr-1.5 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          )}
          {aiDrafting ? 'Drafting…' : 'AI Draft'}
        </Button>
        <Link href={`/dashboard/clients/${id}/design-sheet`}>
          <Button variant="outline">
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Design Sheet
          </Button>
        </Link>
        <Link href={`/dashboard/clients/${id}/tier2`}>
          <Button variant="outline">
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Open Will Editor
          </Button>
        </Link>
        <Link href={`/dashboard/clients/${id}/documents`}>
          <Button>
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Generate Documents
          </Button>
        </Link>
        <Link href={`/dashboard/clients/${id}/signing`}>
          <Button variant="outline">
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Signing Ceremony
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={handleSendReviewLink}
          disabled={reviewLinkLoading}
        >
          <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          {reviewLinkLoading ? 'Generating...' : 'Send Review Link'}
        </Button>
      </div>

      {/* AI Draft result */}
      {aiDraftError && (
        <div className="rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-4 text-sm text-[#8a6a1e]">{aiDraftError}</div>
      )}
      {aiDraftResult && (
        <Card className="border-[#C9A84C]/40">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#C9A84C]/15 px-2.5 py-1 text-xs font-semibold text-[#8a6a1e]">
                AI Draft · {aiDraftResult.needs_dual_will ? 'Dual Will recommended' : 'Single Will'}
              </span>
              {aiDraftResult.engine === 'rules' && (
                <span className="text-xs text-gray-400">rules engine</span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-[#2D2D2D]/80">{aiDraftResult.reasoning}</p>
            {aiDraftResult.saved_document_types && aiDraftResult.saved_document_types.length > 0 && (
              <p className="text-sm text-gray-600">
                <span className="font-medium text-[#1B2A4A]">Documents prepared:</span>{' '}
                {aiDraftResult.saved_document_types.map((t) => t.replace(/_/g, ' ')).join(', ')}
              </p>
            )}
            <Link href={`/dashboard/clients/${id}/tier2`}>
              <Button className="mt-1">
                Review in Will Editor
                <svg className="ml-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Questionnaire link resend (#88): the backend endpoint existed but
          nothing in the UI called it — the only fallback was copy-the-link. */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Questionnaire Link</p>
            <p className="text-xs text-gray-500">
              Re-sends the client&apos;s existing link by email — no new link is created.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {resendStatus && (
              <span className={`text-xs ${resendStatus.startsWith('Sent') ? 'text-green-600' : 'text-red-700'}`}>
                {resendStatus}
              </span>
            )}
            <Button variant="outline" size="sm" disabled={!draft.client_email || resending}
              onClick={handleResendLink}>
              {resending ? 'Sending…' : draft.client_email ? 'Resend by email' : 'No client email'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Review Link Delivery Options */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Review Link Delivery</p>
            <div className="flex gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={reviewSendEmail}
                  onChange={(e) => setReviewSendEmail(e.target.checked)}
                  disabled={!draft.client_email}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <span className={draft.client_email ? 'text-gray-700' : 'text-gray-400'}>
                  Email {draft.client_email ? `(${draft.client_email})` : '(not set)'}
                </span>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={reviewSendSms}
                  onChange={(e) => setReviewSendSms(e.target.checked)}
                  disabled={!draft.client_phone}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <span className={draft.client_phone ? 'text-gray-700' : 'text-gray-400'}>
                  SMS {draft.client_phone ? `(${draft.client_phone})` : '(not set)'}
                </span>
              </label>
            </div>
          </div>
          {reviewLink && (
            <>
              <div className="flex items-center gap-3">
                <code className="block flex-1 truncate rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
                  {reviewLink}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopyReviewLink} className="shrink-0">
                  {reviewLinkCopied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              {reviewDeliveryStatus && (
                (reviewDeliveryStatus.email === 'sent' || reviewDeliveryStatus.sms === 'sent') ? (
                  <p className="text-xs text-gray-500">
                    Delivery:
                    {reviewDeliveryStatus.email === 'sent' && <span className="ml-1 text-green-600">✓ Email sent</span>}
                    {reviewDeliveryStatus.sms === 'sent' && <span className="ml-1 text-green-600">✓ SMS sent</span>}
                  </p>
                ) : (
                  <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                    The review link was NOT delivered to the client
                    {(reviewDeliveryStatus.email === 'logged_only' || reviewDeliveryStatus.sms === 'logged_only')
                      ? ' (email/SMS is not configured on this server — messages are only written to the log)'
                      : ''}
                    . Copy the link above and send it yourself.
                  </p>
                )
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* AI Flags */}
      <AiFlagsSummary flags={flags} />

      {/* Client review comments (#87): what the client said about specific
          clauses in the review portal — previously written to the database
          and surfaced nowhere. */}
      {reviewComments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Client comments from the review portal</CardTitle>
            <CardDescription>
              {reviewComments.length} comment{reviewComments.length === 1 ? '' : 's'} — each is a question or concern about a specific clause.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {reviewComments.map((comment, index) => (
              <div key={comment.id ?? index} className="rounded-md border border-[#E8E4DF] bg-[#FAF8F5] p-3 text-sm">
                <p className="text-xs font-medium text-gray-500">
                  {comment.document_type} · clause {comment.clause_id}
                  {comment.created_at ? ` · ${new Date(comment.created_at).toLocaleString()}` : ''}
                </p>
                <p className="mt-1 text-gray-800">{comment.comment_text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Follow-up questions (#98): the lawyer asks, the client answers via
          their questionnaire link, the lawyer resolves. Required questions
          block approval of the targeted document until resolved. */}
      <Card>
        <CardHeader>
          <CardTitle>Follow-up questions</CardTitle>
          <CardDescription>
            Ask the client anything the file is missing — they answer through their
            questionnaire link. A question marked required blocks approval of the selected
            document (or of every document when unscoped) until you mark it resolved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-md border border-[#E8E4DF] bg-[#FAF8F5] p-3">
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={2}
              placeholder="e.g. Your RRSP still names a former spouse as beneficiary — is that intended?"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={questionRequired}
                  onChange={(e) => setQuestionRequired(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <span className="text-gray-700">Required before approval</span>
              </label>
              <select
                value={questionDocType}
                onChange={(e) => setQuestionDocType(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700"
                aria-label="Document this question is about"
              >
                <option value="">Entire file</option>
                {QUESTION_DOC_OPTIONS.map((docOption) => (
                  <option key={docOption.id} value={docOption.id}>{docOption.shortName}</option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={handleAskQuestion}
                disabled={asking || !questionText.trim()}
                className="ml-auto"
              >
                {asking ? 'Sending…' : 'Ask client'}
              </Button>
            </div>
            {askError && <p className="text-xs text-red-600">{askError}</p>}
          </div>

          {questions.length === 0 ? (
            <p className="text-sm italic text-gray-400">No follow-up questions yet.</p>
          ) : (
            <div className="space-y-2">
              {questions.map((question) => (
                <div key={question.id} className="rounded-md border border-[#E8E4DF] p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={QUESTION_STATUS_BADGE[question.status].variant}>
                      {QUESTION_STATUS_BADGE[question.status].label}
                    </Badge>
                    {question.required && <Badge variant="destructive">Required before approval</Badge>}
                    {question.document_type && (
                      <span className="text-xs text-gray-500">{questionDocLabel(question.document_type)}</span>
                    )}
                    <span className="ml-auto text-xs text-gray-400">
                      Asked {new Date(question.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-gray-800">{question.question_text}</p>
                  {question.answer_text && (
                    <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 p-2">
                      <p className="text-xs font-medium text-blue-700">
                        Client&apos;s answer
                        {question.answered_at ? ` · ${new Date(question.answered_at).toLocaleString()}` : ''}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-gray-800">{question.answer_text}</p>
                    </div>
                  )}
                  {question.status === 'resolved' ? (
                    <p className="mt-2 text-xs text-gray-500">
                      Resolved{question.resolved_at ? ` ${new Date(question.resolved_at).toLocaleString()}` : ''}
                      {question.resolution_note ? ` — ${question.resolution_note}` : ''}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={resolveNotes[question.id] ?? ''}
                        onChange={(e) => setResolveNotes((prev) => ({ ...prev, [question.id]: e.target.value }))}
                        placeholder="Resolution note (optional)"
                        className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResolveQuestion(question.id)}
                        disabled={resolvingId === question.id}
                      >
                        {resolvingId === question.id ? 'Resolving…' : 'Mark resolved'}
                      </Button>
                    </div>
                  )}
                  {resolveErrors[question.id] && (
                    <p className="mt-1 text-xs text-red-600">{resolveErrors[question.id]}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timestamps */}
      <div className="flex gap-6 text-xs text-gray-400">
        <span>Created: {new Date(draft.created_at).toLocaleDateString('en-CA')}</span>
        <span>Updated: {new Date(draft.updated_at).toLocaleDateString('en-CA')}</span>
        {draft.submitted_at && <span>Submitted: {new Date(draft.submitted_at).toLocaleDateString('en-CA')}</span>}
      </div>

      <Separator />

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-[#1B2A4A] text-[#1B2A4A]'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <EstateOverview
          draft={draft as DraftDetail & { assets: Array<Record<string, unknown>>; people: Array<Record<string, unknown>>; ai_flags: Array<{ id: string; severity: string; title: string; description: string; statute?: string; dismissed?: boolean }> }}
          onNavigate={handleNavigate}
        />
      )}

      {activeTab === 'answers' && (
        <div>
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Client Answers</h3>
          <div className="space-y-6">
            {SECTION_LABELS.map((section) => (
              <Card key={section.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{section.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <SectionData label="" data={sectionData[section.key]} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Document generation and management is available on the dedicated documents page.
          </p>
          <Link href={`/dashboard/clients/${id}/documents`}>
            <Button>
              <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Go to Documents
            </Button>
          </Link>
        </div>
      )}

      {activeTab === 'tier2' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Review and edit the clauses for every document (Will, POAs) on the full Will Editor page.
          </p>
          <Link href={`/dashboard/clients/${id}/tier2`}>
            <Button variant="outline">
              <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Open Will Editor
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
