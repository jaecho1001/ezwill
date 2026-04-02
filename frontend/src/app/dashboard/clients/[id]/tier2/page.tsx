'use client'

import { useEffect, useState, use, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getDraft, saveDraftToServer } from '@/lib/api/drafts'
import {
  willDocumentTypes,
  buildDefaultSelections,
} from '@/lib/will-documents/index'
import type { WillDocumentType, SelectedWillClause } from '@/types/will-document'
import { ClauseEditor } from '@/components/editor/clause-editor'

export default function Tier2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [selectedDocType, setSelectedDocType] = useState<WillDocumentType>('single_will')
  const [clausesByDocType, setClausesByDocType] = useState<Record<string, SelectedWillClause[]>>({})
  const [draftData, setDraftData] = useState<Record<string, unknown>>({})

  useEffect(() => {
    getDraft(id)
      .then((res) => {
        if (!res) {
          setError('Draft not found')
          return
        }
        setDraftData(res as unknown as Record<string, unknown>)

        // Initialize clause selections from draft or defaults
        const stored = (res as unknown as { tier2_clauses?: Record<string, SelectedWillClause[]> }).tier2_clauses
        const initial: Record<string, SelectedWillClause[]> = {}
        for (const docType of willDocumentTypes) {
          if (stored && stored[docType.id] && Array.isArray(stored[docType.id])) {
            initial[docType.id] = stored[docType.id]
          } else if (stored && stored[docType.id]) {
            // Legacy format: array of clause IDs
            const ids = stored[docType.id] as unknown as string[]
            if (Array.isArray(ids)) {
              const defaults = buildDefaultSelections(docType.id)
              initial[docType.id] = defaults.map((sc) => ({
                ...sc,
                included: ids.includes(sc.clauseId),
              }))
            } else {
              initial[docType.id] = buildDefaultSelections(docType.id)
            }
          } else {
            initial[docType.id] = buildDefaultSelections(docType.id)
          }
        }
        setClausesByDocType(initial)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  // Build variables from draft data for placeholder resolution
  const variables = useMemo(() => {
    const d = draftData as Record<string, unknown>
    const aboutYou = (d.about_you ?? d.aboutYou ?? {}) as Record<string, string>
    const yourFamily = (d.your_family ?? d.yourFamily ?? {}) as Record<string, string>
    return {
      testatorFullName: [aboutYou.firstName, aboutYou.lastName].filter(Boolean).join(' ') || '[Full Name]',
      city: aboutYou.city || 'City',
      cityName: aboutYou.cityName || aboutYou.city || '[City]',
      province: aboutYou.province || 'Ontario',
      spouseFullName: [yourFamily.spouseFirstName, yourFamily.spouseLastName].filter(Boolean).join(' ') || '[Spouse Name]',
      executorFullName: '[Executor Name]',
      backupExecutorFullName: '[Backup Executor Name]',
      guardianFullName: '[Guardian Name]',
      date: new Date().toLocaleDateString('en-CA'),
    }
  }, [draftData])

  const handleClausesChange = useCallback(
    (clauses: SelectedWillClause[]) => {
      setClausesByDocType((prev) => ({
        ...prev,
        [selectedDocType]: clauses,
      }))
    },
    [selectedDocType]
  )

  async function handleSave() {
    setSaving(true)
    setSaveSuccess(false)

    try {
      await fetch(`/api/drafts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier2_clauses: clausesByDocType }),
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setError('Failed to save clause selections')
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href={`/dashboard/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Client
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    )
  }

  const currentClauses = clausesByDocType[selectedDocType] ?? []

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Link href={`/dashboard/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Client
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Clause Editor</h2>
          <p className="mt-1 text-sm text-gray-500">Edit and configure document clauses for each document type.</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>

      {/* Document type tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {willDocumentTypes.map((docType) => (
          <button
            key={docType.id}
            onClick={() => setSelectedDocType(docType.id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
              selectedDocType === docType.id
                ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className="text-base">{docType.icon}</span>
            <span className="text-sm font-medium text-gray-900">{docType.shortName}</span>
            <Badge variant={docType.tier === 1 ? 'secondary' : 'warning'} className="text-[10px]">
              T{docType.tier}
            </Badge>
          </button>
        ))}
      </div>

      {/* Clause Editor */}
      <ClauseEditor
        documentType={selectedDocType}
        selectedClauses={currentClauses}
        onClausesChange={handleClausesChange}
        variables={variables}
      />
    </div>
  )
}
