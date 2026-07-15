'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { listDrafts, type DraftListItem } from '@/lib/api/drafts'

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'in_review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
] as const

export default function ClientsListPage() {
  const [drafts, setDrafts] = useState<DraftListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('all')

  useEffect(() => {
    listDrafts({ limit: 200 })
      .then((res) => setDrafts(res.drafts))
      .catch((err) => setError(err.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const filtered =
    activeTab === 'all'
      ? drafts
      : drafts.filter((d) => d.status === activeTab)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
          <p className="mt-1 text-sm text-gray-500">Manage client will drafts and intake progress.</p>
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

      {/* Status Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {activeTab !== tab.key && (
              <span className="ml-1.5 text-xs text-gray-400">
                ({tab.key === 'all' ? drafts.length : drafts.filter((d) => d.status === tab.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B2A4A] border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filtered.length} client{filtered.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No clients match this filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="pb-3 pr-4 font-medium text-gray-500">Name</th>
                      <th className="pb-3 pr-4 font-medium text-gray-500">Email</th>
                      <th className="pb-3 pr-4 font-medium text-gray-500">Status</th>
                      <th className="pb-3 pr-4 font-medium text-gray-500">Progress</th>
                      <th className="pb-3 pr-4 font-medium text-gray-500">Language</th>
                      <th className="pb-3 pr-4 font-medium text-gray-500">Updated</th>
                      <th className="pb-3 font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((draft) => (
                      <tr key={draft.id} className="hover:bg-gray-50">
                        <td className="py-3 pr-4 font-medium text-gray-900">
                          {draft.client_first_name} {draft.client_last_name}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          {draft.client_email || <span className="text-gray-300">--</span>}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={draft.status} />
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full rounded-full bg-[#1B2A4A] transition-all"
                                style={{ width: `${Math.round((draft.completed_steps.length / 7) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">
                              Step {draft.current_step + 1} of 7
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-gray-500 uppercase text-xs">
                          {draft.language}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          {new Date(draft.updated_at).toLocaleDateString('en-CA', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="py-3">
                          <Link href={`/dashboard/clients/${draft.id}`}>
                            <Button variant="ghost" size="sm">View</Button>
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
      )}
    </div>
  )
}
