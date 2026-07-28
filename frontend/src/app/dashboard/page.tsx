'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { listDrafts, type DraftListItem } from '@/lib/api/drafts'
import { getAuthHeaders } from '@/lib/auth'

interface PipelineOverview {
  status_counts: Record<string, number>
  awaiting_review: Array<{ id: string; client_first_name: string; client_last_name: string; submitted_at?: string | null }>
  open_questions: Array<{ id: string; draft_id: string; question_text: string; required: boolean; status: string; client_first_name: string; client_last_name: string }>
  awaiting_approval: Array<{ draft_id: string; document_type: string; generated_at?: string | null; client_first_name: string; client_last_name: string }>
  failed_deliveries: Array<{ id: string; draft_id: string; kind: string; channel: string; status: string; client_first_name: string; client_last_name: string; created_at?: string }>
}

function QueueCard({ title, tone, count, children, empty }: {
  title: string
  tone: 'amber' | 'red' | 'blue'
  count: number
  children: React.ReactNode
  empty: string
}) {
  const tones = {
    amber: 'border-[#C9A84C]/50 bg-[#C9A84C]/5',
    red: 'border-red-300 bg-red-50/50',
    blue: 'border-[#1B2A4A]/20 bg-[#1B2A4A]/5',
  } as const
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 shadow-sm">{count}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {count === 0 ? <p className="text-xs text-gray-400">{empty}</p> : children}
      </div>
    </div>
  )
}

interface Stats {
  total: number
  submitted: number
  inProgress: number
  completed: number
}

function computeStats(drafts: DraftListItem[]): Stats {
  return {
    total: drafts.length,
    submitted: drafts.filter((d) => d.status === 'submitted').length,
    inProgress: drafts.filter((d) => d.status === 'in_progress' || d.status === 'opened').length,
    completed: drafts.filter((d) => d.status === 'approved' || d.status === 'signed').length,
  }
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const [drafts, setDrafts] = useState<DraftListItem[]>([])
  const [overview, setOverview] = useState<PipelineOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/drafts/overview', { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then(setOverview)
      .catch(() => {})
    listDrafts({ limit: 50 })
      .then((res) => {
        setDrafts(res.drafts)
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to load drafts')
      })
      .finally(() => setLoading(false))
  }, [])

  const stats = computeStats(drafts)
  const recent = [...drafts]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500">Overview of client will drafts and activity.</p>
        </div>
        <Link href="/dashboard/clients/new">
          <Button>
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Client
          </Button>
        </Link>
      </div>

      {/* Action queues — what needs a human today. */}
      {overview && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <QueueCard title="Submitted — awaiting your review" tone="amber"
            count={overview.awaiting_review.length}
            empty="No files waiting.">
            {overview.awaiting_review.slice(0, 5).map((d) => (
              <Link key={d.id} href={`/dashboard/clients/${d.id}`}
                className="block truncate text-sm text-[#1B2A4A] underline-offset-2 hover:underline">
                {d.client_first_name} {d.client_last_name}
                {d.submitted_at && <span className="ml-1 text-xs text-gray-400">{new Date(d.submitted_at).toLocaleDateString()}</span>}
              </Link>
            ))}
          </QueueCard>

          <QueueCard title="Client questions open" tone="blue"
            count={overview.open_questions.length}
            empty="No open questions.">
            {overview.open_questions.slice(0, 5).map((q) => (
              <Link key={q.id} href={`/dashboard/clients/${q.draft_id}`}
                className="block text-sm text-[#1B2A4A] underline-offset-2 hover:underline">
                <span className="truncate">{q.client_first_name} {q.client_last_name}: {q.question_text.slice(0, 48)}{q.question_text.length > 48 ? '…' : ''}</span>
                {q.required && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">required</span>}
                {q.status === 'answered' && <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-800">answered — resolve</span>}
              </Link>
            ))}
          </QueueCard>

          <QueueCard title="Generated — not yet released" tone="blue"
            count={overview.awaiting_approval.length}
            empty="Nothing awaiting approval.">
            {overview.awaiting_approval.slice(0, 5).map((r, i) => (
              <Link key={`${r.draft_id}-${r.document_type}-${i}`} href={`/dashboard/clients/${r.draft_id}/documents`}
                className="block truncate text-sm text-[#1B2A4A] underline-offset-2 hover:underline">
                {r.client_first_name} {r.client_last_name} — {r.document_type}
              </Link>
            ))}
          </QueueCard>

          <QueueCard title="Delivery problems (14 days)" tone="red"
            count={overview.failed_deliveries.length}
            empty="All deliveries OK.">
            {overview.failed_deliveries.slice(0, 5).map((r) => (
              <Link key={r.id} href={`/dashboard/clients/${r.draft_id}`}
                className="block truncate text-sm text-red-800 underline-offset-2 hover:underline">
                {r.client_first_name} {r.client_last_name} — {r.kind} {r.channel}: {r.status === 'logged_only' ? 'not configured' : 'failed'}
              </Link>
            ))}
          </QueueCard>
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B2A4A] border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Clients" value={stats.total} accent="text-gray-900" />
            <StatCard label="Submitted (Pending Review)" value={stats.submitted} accent="text-green-600" />
            <StatCard label="In Progress" value={stats.inProgress} accent="text-[#8a6a1e]" />
            <StatCard label="Completed" value={stats.completed} accent="text-emerald-600" />
          </div>

          {/* Recent Submissions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Submissions</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No drafts yet. Create a new client to get started.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left">
                        <th className="pb-3 pr-4 font-medium text-gray-500">Client Name</th>
                        <th className="pb-3 pr-4 font-medium text-gray-500">Status</th>
                        <th className="pb-3 pr-4 font-medium text-gray-500">Last Updated</th>
                        <th className="pb-3 font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recent.map((draft) => (
                        <tr key={draft.id} className="hover:bg-gray-50">
                          <td className="py-3 pr-4 font-medium text-gray-900">
                            {draft.client_first_name} {draft.client_last_name}
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge status={draft.status} />
                          </td>
                          <td className="py-3 pr-4 text-gray-500">
                            {new Date(draft.updated_at).toLocaleDateString('en-CA', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-3">
                            <Link href={`/dashboard/clients/${draft.id}`}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
