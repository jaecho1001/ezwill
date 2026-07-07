'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { listDrafts, type DraftListItem } from '@/lib/api/drafts'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
