'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  approveClauseVersion,
  createClauseVersion,
  getLegalClause,
  getLegalSourcePages,
  linkClauseSource,
  listLegalClauses,
  listLegalSources,
  recordClauseDecision,
  updateClauseVersion,
  type ClauseDetail,
  type ClauseTemplateSummary,
  type ClauseVersion,
  type ClauseVersionInput,
  type LegalSource,
  type LegalSourcePage,
} from '@/lib/api/legal-library'

type FormState = {
  clauseText: string
  internalExplanation: string
  clientExplanation: string
  qa: Array<{ question: string; answer: string }>
  statutes: string
  cases: string
  applicability: string
  changeSummary: string
}

const EMPTY_FORM: FormState = {
  clauseText: '',
  internalExplanation: '',
  clientExplanation: '',
  qa: [],
  statutes: '',
  cases: '',
  applicability: '{}',
  changeSummary: '',
}

function formFromVersion(version?: ClauseVersion | null): FormState {
  if (!version) return EMPTY_FORM
  return {
    clauseText: version.clause_text ?? '',
    internalExplanation: version.internal_explanation ?? '',
    clientExplanation: version.client_explanation ?? '',
    qa: Array.isArray(version.client_qa)
      ? version.client_qa.map((item) => ({ question: item.question ?? '', answer: item.answer ?? '' }))
      : [],
    statutes: (version.statute_citations ?? []).join('\n'),
    cases: (version.case_citations ?? []).join('\n'),
    applicability: JSON.stringify(version.applicability_rules ?? {}, null, 2),
    changeSummary: version.change_summary ?? '',
  }
}

function splitCitations(value: string): string[] {
  return value.split(/\n|;/).map((item) => item.trim()).filter(Boolean)
}

function StatusBadge({ status }: { status?: string | null }) {
  const variant = status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : 'warning'
  return <Badge variant={variant}>{status?.replaceAll('_', ' ') || 'not started'}</Badge>
}

export default function LegalLibraryPage() {
  const [clauses, setClauses] = useState<ClauseTemplateSummary[]>([])
  const [sources, setSources] = useState<LegalSource[]>([])
  const [selectedClauseKey, setSelectedClauseKey] = useState('')
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [detail, setDetail] = useState<ClauseDetail | null>(null)
  const [sourcePage, setSourcePage] = useState<LegalSourcePage | null>(null)
  const [sourceResults, setSourceResults] = useState<LegalSourcePage[]>([])
  const [pageNumber, setPageNumber] = useState(1)
  const [sourceSearch, setSourceSearch] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null)
  const [reviewerName, setReviewerName] = useState('')
  const [reviewerNote, setReviewerNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedSource = sources.find((source) => source.id === selectedSourceId)
  const approvedVersion = useMemo(() => {
    if (!detail) return null
    return detail.versions.find((version) => version.id === detail.template.current_version_id)
      ?? detail.versions.find((version) => version.status === 'approved')
      ?? null
  }, [detail])
  const baselineVersion = useMemo(() => {
    if (!detail) return null
    return approvedVersion ?? detail.versions.at(-1) ?? detail.versions[0] ?? null
  }, [approvedVersion, detail])
  const proposedVersion = useMemo(() => {
    if (!detail) return null
    return detail.versions.find((version) => ['draft', 'in_review'].includes(version.status)) ?? null
  }, [detail])

  const loadDetail = useCallback(async (clauseKey: string) => {
    const next = await getLegalClause(clauseKey)
    setDetail(next)
    const editable = next.versions.find((version) => ['draft', 'in_review'].includes(version.status))
    const approved = next.versions.find((version) => version.id === next.template.current_version_id)
      ?? next.versions.find((version) => version.status === 'approved')
    const baseline = approved ?? next.versions.at(-1) ?? next.versions[0]
    setEditingVersionId(editable?.id ?? null)
    setForm(formFromVersion(editable ?? baseline))
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [clausePayload, sourcePayload] = await Promise.all([
          listLegalClauses(),
          listLegalSources(),
        ])
        setClauses(clausePayload.clauses)
        setSources(sourcePayload.sources)
        const firstClause = clausePayload.clauses.find((clause) => !clause.is_folder) ?? clausePayload.clauses[0]
        if (firstClause) setSelectedClauseKey(firstClause.clause_key)
        if (sourcePayload.sources[0]) {
          setSelectedSourceId(sourcePayload.sources[0].id)
          const pagePayload = await getLegalSourcePages(sourcePayload.sources[0].id, { page: 1 })
          setSourcePage(pagePayload.pages[0] ?? null)
          setPageNumber(1)
        }
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedClauseKey) return
    setError(null)
    setMessage(null)
    loadDetail(selectedClauseKey).catch((err) => setError((err as Error).message))
  }, [loadDetail, selectedClauseKey])

  const loadPage = useCallback(async (nextPage: number) => {
    if (!selectedSourceId || !selectedSource) return
    const safePage = Math.max(1, Math.min(nextPage, selectedSource.page_count))
    const payload = await getLegalSourcePages(selectedSourceId, { page: safePage })
    setPageNumber(safePage)
    setSourcePage(payload.pages[0] ?? null)
    setSourceResults([])
  }, [selectedSource, selectedSourceId])

  function buildPayload(): ClauseVersionInput {
    let rules: Record<string, unknown>
    try {
      rules = JSON.parse(form.applicability || '{}') as Record<string, unknown>
    } catch {
      throw new Error('Applicability rules must be valid JSON.')
    }
    return {
      clause_text: form.clauseText,
      internal_explanation: form.internalExplanation,
      client_explanation: form.clientExplanation,
      client_qa: form.qa.filter((item) => item.question.trim() || item.answer.trim()),
      statute_citations: splitCitations(form.statutes),
      case_citations: splitCitations(form.cases),
      applicability_rules: rules,
      change_summary: form.changeSummary,
      created_by: reviewerName || undefined,
    }
  }

  async function saveDraft(): Promise<string> {
    if (!selectedClauseKey) throw new Error('Select a clause first.')
    const payload = buildPayload()
    const result = editingVersionId
      ? await updateClauseVersion(editingVersionId, payload)
      : await createClauseVersion(selectedClauseKey, payload)
    setEditingVersionId(result.version.id)
    await loadDetail(selectedClauseKey)
    return result.version.id
  }

  async function handleSave() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await saveDraft()
      setMessage('Draft revision saved. Approved versions remain unchanged.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSourceSearch() {
    if (!selectedSourceId || sourceSearch.trim().length < 2) return
    setBusy(true)
    setError(null)
    try {
      const payload = await getLegalSourcePages(selectedSourceId, { query: sourceSearch.trim(), limit: 20 })
      setSourceResults(payload.pages)
      if (payload.pages[0]) {
        setSourcePage(payload.pages[0])
        setPageNumber(payload.pages[0].pdf_page_number)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleLinkSource() {
    if (!sourcePage || !selectedSourceId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const versionId = editingVersionId ?? await saveDraft()
      await linkClauseSource(versionId, {
        source_document_id: selectedSourceId,
        source_page_id: sourcePage.id,
        pdf_page_number: sourcePage.pdf_page_number,
        relation_type: 'research_basis',
        internal_note: `Reviewed against page ${sourcePage.pdf_page_number} in the legal-source workspace.`,
      })
      await loadDetail(selectedClauseKey)
      setMessage(`Linked source page ${sourcePage.pdf_page_number} to the proposed version.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove() {
    if (!reviewerName.trim()) {
      setError('Enter the approving lawyer’s name.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const versionId = await saveDraft()
      await approveClauseVersion(versionId, {
        reviewer_name: reviewerName.trim(),
        reviewer_note: reviewerNote.trim() || undefined,
      })
      await loadDetail(selectedClauseKey)
      setMessage('Clause version approved and published as the current firm template.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDecision(decision: 'request_changes' | 'reject' | 'defer') {
    if (!editingVersionId || !reviewerName.trim()) {
      setError('Save a draft and enter the reviewing lawyer’s name first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await recordClauseDecision(editingVersionId, {
        decision,
        reviewer_name: reviewerName.trim(),
        reviewer_note: reviewerNote.trim() || undefined,
      })
      await loadDetail(selectedClauseKey)
      setMessage(`Review decision recorded: ${decision.replaceAll('_', ' ')}.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="flex h-72 items-center justify-center text-sm text-gray-500">Loading legal library…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Legal Library Review</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Compare licensed internal sources with the current firm clause, prepare an original revision,
            and publish only after lawyer approval. Client education is stored separately from internal commentary.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Internal only</Badge>
          <Badge variant="secondary">{clauses.length} clauses</Badge>
        </div>
      </div>

      <div className="rounded-xl border border-[#E8E4DF] bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Clause under review</span>
            <select
              value={selectedClauseKey}
              onChange={(event) => setSelectedClauseKey(event.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
            >
              {clauses.map((clause) => (
                <option key={clause.clause_key} value={clause.clause_key}>
                  {clause.section} — {clause.heading}{clause.is_default ? ' (Default)' : ''}
                </option>
              ))}
            </select>
          </label>
          {detail && <StatusBadge status={detail.template.lifecycle_status} />}
          {detail?.template.is_default && <Badge variant="info">Default clause</Badge>}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}

      <div className="grid min-h-[720px] gap-4 xl:grid-cols-[0.95fr_1fr_1.15fr]">
        {/* Licensed source */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#E8E4DF] bg-white">
          <header className="border-b border-[#E8E4DF] bg-[#FAF8F5] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8a6a1e]">Licensed source</p>
                <h3 className="text-sm font-semibold text-gray-900">Internal research viewer</h3>
              </div>
              <Badge variant="warning">Do not publish</Badge>
            </div>
          </header>
          <div className="space-y-3 border-b border-[#E8E4DF] p-3">
            <select
              value={selectedSourceId}
              onChange={async (event) => {
                const sourceId = event.target.value
                setSelectedSourceId(sourceId)
                try {
                  const payload = await getLegalSourcePages(sourceId, { page: 1 })
                  setSourcePage(payload.pages[0] ?? null)
                  setPageNumber(1)
                  setSourceResults([])
                } catch (err) {
                  setError((err as Error).message)
                }
              }}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-xs"
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>{source.title}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input
                value={sourceSearch}
                onChange={(event) => setSourceSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleSourceSearch() }}
                placeholder="Search this publication…"
                className="h-9 text-xs"
              />
              <Button size="sm" variant="outline" onClick={handleSourceSearch} disabled={busy || sourceSearch.trim().length < 2}>
                Find
              </Button>
            </div>
            {sourceResults.length > 1 && (
              <select
                value={sourcePage?.id ?? ''}
                onChange={(event) => {
                  const page = sourceResults.find((result) => result.id === event.target.value)
                  if (page) { setSourcePage(page); setPageNumber(page.pdf_page_number) }
                }}
                className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-xs"
              >
                {sourceResults.map((page) => (
                  <option key={page.id} value={page.id}>Page {page.pdf_page_number} — {page.inferred_heading || 'Match'}</option>
                ))}
              </select>
            )}
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="ghost" onClick={() => loadPage(pageNumber - 1)} disabled={pageNumber <= 1}>Previous</Button>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                Page
                <input
                  type="number"
                  min={1}
                  max={selectedSource?.page_count ?? 1}
                  value={pageNumber}
                  onChange={(event) => setPageNumber(Number(event.target.value))}
                  onBlur={() => loadPage(pageNumber)}
                  className="h-8 w-16 rounded border border-gray-300 px-2 text-center"
                />
                / {selectedSource?.page_count ?? '—'}
              </div>
              <Button size="sm" variant="ghost" onClick={() => loadPage(pageNumber + 1)} disabled={pageNumber >= (selectedSource?.page_count ?? 1)}>Next</Button>
            </div>
            <Button className="w-full" size="sm" variant="outline" onClick={handleLinkSource} disabled={!sourcePage || busy}>
              Link this page to proposal
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {sourcePage ? (
              <>
                <p className="mb-3 text-xs font-semibold text-gray-500">{sourcePage.inferred_heading || `PDF page ${sourcePage.pdf_page_number}`}</p>
                <pre className="whitespace-pre-wrap font-serif text-[12px] leading-5 text-gray-700">{sourcePage.source_text}</pre>
              </>
            ) : <p className="text-sm text-gray-400">No source page selected.</p>}
          </div>
        </section>

        {/* Current approved clause */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#E8E4DF] bg-white">
          <header className="border-b border-[#E8E4DF] bg-[#FAF8F5] px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1B2A4A]">Current firm clause</p>
                <h3 className="text-sm font-semibold text-gray-900">{detail?.template.heading ?? 'Select a clause'}</h3>
                <p className="text-xs text-gray-500">{detail?.template.section}{detail?.template.subsection ? ` / ${detail.template.subsection}` : ''}</p>
              </div>
              <StatusBadge status={baselineVersion?.status} />
            </div>
          </header>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            {!approvedVersion && baselineVersion && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                No approved database version exists yet. Version {baselineVersion.version_number} is shown as the imported firm baseline.
              </div>
            )}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Clause text</p>
              <div className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 font-serif text-sm leading-6 text-gray-800">
                {baselineVersion?.clause_text || 'No clause text.'}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Internal explanation</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{baselineVersion?.internal_explanation || 'Not yet written.'}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Client education</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{baselineVersion?.client_explanation || 'Not yet approved for clients.'}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Verified source links</p>
              <div className="space-y-2">
                {detail?.source_links.length ? detail.source_links.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    onClick={async () => {
                      setSelectedSourceId(link.source_document_id)
                      if (link.pdf_page_number) {
                        try {
                          const payload = await getLegalSourcePages(link.source_document_id, { page: link.pdf_page_number })
                          setSourcePage(payload.pages[0] ?? null)
                          setPageNumber(link.pdf_page_number)
                          setSourceResults([])
                        } catch (err) {
                          setError((err as Error).message)
                        }
                      }
                    }}
                    className="block w-full rounded-md border border-gray-200 p-2 text-left text-xs hover:border-[#C9A84C] hover:bg-[#C9A84C]/5"
                  >
                    <span className="font-medium">{link.source_title}</span> · page {link.pdf_page_number ?? link.printed_page_label ?? '—'}
                    <span className="block text-gray-400">Version link: {link.relation_type.replaceAll('_', ' ')}</span>
                  </button>
                )) : <p className="text-xs text-gray-400">No source page linked yet.</p>}
              </div>
            </div>
          </div>
        </section>

        {/* Proposed revision */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#C9A84C]/50 bg-white shadow-sm">
          <header className="border-b border-[#C9A84C]/30 bg-[#C9A84C]/8 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8a6a1e]">Proposed revision</p>
                <h3 className="text-sm font-semibold text-gray-900">
                  {proposedVersion ? `Version ${proposedVersion.version_number}` : 'New draft version'}
                </h3>
              </div>
              <StatusBadge status={proposedVersion?.status ?? 'draft'} />
            </div>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-600">Clause text</span>
              <Textarea value={form.clauseText} onChange={(event) => setForm({ ...form, clauseText: event.target.value })} className="min-h-44 font-serif leading-6" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-600">Internal lawyer explanation</span>
              <Textarea value={form.internalExplanation} onChange={(event) => setForm({ ...form, internalExplanation: event.target.value })} className="min-h-28" placeholder="Purpose, use cases, cautions and drafting considerations…" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-600">Client education — no legal advice</span>
              <Textarea value={form.clientExplanation} onChange={(event) => setForm({ ...form, clientExplanation: event.target.value })} className="min-h-24" placeholder="Firm-authored plain-language explanation for client review…" />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">Client Q&amp;A</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, qa: [...form.qa, { question: '', answer: '' }] })}>Add question</Button>
              </div>
              {form.qa.map((item, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-gray-200 p-3">
                  <Input value={item.question} onChange={(event) => setForm({ ...form, qa: form.qa.map((qa, i) => i === index ? { ...qa, question: event.target.value } : qa) })} placeholder="General client question" />
                  <Textarea value={item.answer} onChange={(event) => setForm({ ...form, qa: form.qa.map((qa, i) => i === index ? { ...qa, answer: event.target.value } : qa) })} placeholder="Educational answer; refer individualized questions to the lawyer" />
                  <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, qa: form.qa.filter((_, i) => i !== index) })}>Remove</Button>
                </div>
              ))}
              {form.qa.length === 0 && <p className="text-xs text-gray-400">No client Q&amp;A drafted.</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-600">Statute citations</span>
                <Textarea value={form.statutes} onChange={(event) => setForm({ ...form, statutes: event.target.value })} placeholder="One per line" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-600">Case citations</span>
                <Textarea value={form.cases} onChange={(event) => setForm({ ...form, cases: event.target.value })} placeholder="One per line" />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-600">Applicability rules (JSON)</span>
              <Textarea value={form.applicability} onChange={(event) => setForm({ ...form, applicability: event.target.value })} className="min-h-28 font-mono text-xs" />
              <span className="block text-[11px] text-gray-400">Deterministic facts only. AI may explain these rules but cannot publish or approve them.</span>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-600">Change summary</span>
              <Textarea value={form.changeSummary} onChange={(event) => setForm({ ...form, changeSummary: event.target.value })} placeholder="Why this revision is proposed and how it differs from the current version…" />
            </label>

            <div className="rounded-lg border border-[#1B2A4A]/15 bg-[#1B2A4A]/5 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#1B2A4A]">Lawyer review controls</p>
              <div className="space-y-2">
                <Input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="Reviewing / approving lawyer name" />
                <Textarea value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} placeholder="Review note or requested changes" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={busy}>{busy ? 'Working…' : 'Save draft'}</Button>
                <Button variant="outline" onClick={() => handleDecision('request_changes')} disabled={busy || !editingVersionId}>Request changes</Button>
                <Button variant="outline" onClick={() => handleDecision('defer')} disabled={busy || !editingVersionId}>Defer</Button>
                <Button variant="outline" onClick={() => handleDecision('reject')} disabled={busy || !editingVersionId}>Reject</Button>
                <Button className="bg-[#2f6b4f] hover:bg-[#285b43]" onClick={handleApprove} disabled={busy || detail?.template.is_folder}>
                  Approve &amp; publish
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Approval requires clause text, internal explanation, client education and a linked source page. Approved versions are immutable.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
