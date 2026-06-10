'use client'

import { useEffect, useState, use, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getDraft } from '@/lib/api/drafts'
import { getAuthHeaders } from '@/lib/auth'
import {
  willDocumentTypes,
  buildDefaultSelections,
} from '@/lib/will-documents/index'
import type { WillDocumentType, SelectedWillClause } from '@/types/will-document'
import { ClauseEditor } from '@/components/editor/clause-editor'
import { useWillVault } from '@/stores/will-vault-store'
import { vaultToVariables } from '@/lib/will-documents/vault-to-variables'

export default function Tier2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const vaultStore = useWillVault(id)
  const vault = vaultStore((s) => s.vault)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [selectedDocType, setSelectedDocType] = useState<WillDocumentType>('single_will')
  const [clausesByDocType, setClausesByDocType] = useState<Record<string, SelectedWillClause[]>>({})
  const [draftData, setDraftData] = useState<Record<string, unknown>>({})

  useEffect(() => {
    async function loadData() {
      try {
        const res = await getDraft(id)
        if (!res) {
          setError('Draft not found')
          return
        }
        setDraftData(res as unknown as Record<string, unknown>)

        // Load clauses from dedicated clause API
        const initial: Record<string, SelectedWillClause[]> = {}
        try {
          const clauseRes = await fetch(`/api/drafts/${id}/clauses`, {
            headers: { ...getAuthHeaders() },
          })
          if (clauseRes.ok) {
            const stored = await clauseRes.json() as Record<string, SelectedWillClause[]>
            for (const docType of willDocumentTypes) {
              if (stored[docType.id] && Array.isArray(stored[docType.id])) {
                initial[docType.id] = stored[docType.id]
              } else {
                initial[docType.id] = buildDefaultSelections(docType.id)
              }
            }
          } else {
            for (const docType of willDocumentTypes) {
              initial[docType.id] = buildDefaultSelections(docType.id)
            }
          }
        } catch {
          for (const docType of willDocumentTypes) {
            initial[docType.id] = buildDefaultSelections(docType.id)
          }
        }
        setClausesByDocType(initial)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  // Build variables from the vault first (canonical source once intake is
  // complete), falling back to legacy draft fields for any keys the vault
  // doesn't cover. Empty vault values are skipped so legacy data can fill
  // the gap without being overwritten by blanks.
  const variables = useMemo(() => {
    const d = draftData as Record<string, unknown>
    const aboutYou = (d.about_you ?? d.aboutYou ?? {}) as Record<string, string>
    const yourFamily = (d.your_family ?? d.yourFamily ?? {}) as Record<string, string>
    const legacy: Record<string, string> = {
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
    const fromVault = vaultToVariables(vault)
    const merged: Record<string, string> = { ...legacy }
    for (const [k, v] of Object.entries(fromVault)) {
      if (v) merged[k] = v
    }
    return merged
  }, [draftData, vault])

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
      const promises = Object.entries(clausesByDocType).map(([docType, clauses]) =>
        fetch(`/api/drafts/${id}/clauses/${docType}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ clauses }),
        })
      )
      const results = await Promise.all(promises)
      if (results.every(r => r.ok)) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        setError('Some clause selections failed to save')
      }
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
        willId={id}
        vault={vault}
      />
    </div>
  )
}
