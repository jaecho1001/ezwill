'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getDraft } from '@/lib/api/drafts'
import { getAuthHeaders } from '@/lib/auth'
import {
  willDocumentTypes,
  determineRequiredDocuments,
  getDocumentTypeConfig,
} from '@/lib/will-documents/index'
import type { WillDocumentType } from '@/types/will-document'

type DocStatus = 'pending' | 'draft' | 'generated' | 'signed'

interface DocumentEntry {
  docType: WillDocumentType
  name: string
  shortName: string
  icon: string
  status: DocStatus
  lastGenerated: string | null
}

const DOC_STATUS_STYLES: Record<DocStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  draft: { label: 'Draft', className: 'bg-[#C9A84C]/15 text-[#8a6a1e]' },
  generated: { label: 'Generated', className: 'bg-green-100 text-green-700' },
  signed: { label: 'Signed', className: 'bg-teal-100 text-teal-700' },
}

export default function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentEntry[]>([])
  const [generating, setGenerating] = useState<string | null>(null)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<string | null>(null)

  useEffect(() => {
    getDraft(id)
      .then((res) => {
        if (!res) {
          setError('Draft not found')
          return
        }

        const d = res as unknown as {
          your_estate?: Record<string, unknown>
          poa_property?: Record<string, unknown>
          poa_personal_care?: Record<string, unknown>
          assets?: Array<Record<string, unknown>>
          tier2_clauses?: Record<string, unknown> | null
        }

        const estate = d.your_estate ?? {}
        const hasDualWill = !!estate.includeDualWill
        const hasPoaProp = !!(d.poa_property as Record<string, unknown>)?.hasAttorney
        const hasPoaCare = !!(d.poa_personal_care as Record<string, unknown>)?.hasAttorney

        const requiredDocTypes = determineRequiredDocuments({
          tier: hasDualWill ? 2 : 1,
          hasDualWill,
          hasPoaProperty: hasPoaProp || true, // Include POAs by default
          hasPoaPersonalCare: hasPoaCare || true,
        })

        const docs: DocumentEntry[] = requiredDocTypes.map((docType) => {
          const config = getDocumentTypeConfig(docType)
          return {
            docType,
            name: config?.name ?? docType,
            shortName: config?.shortName ?? docType,
            icon: config?.icon ?? '',
            status: 'pending' as DocStatus,
            lastGenerated: null,
          }
        })

        setDocuments(docs)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleGenerate(docType: string) {
    setGenerating(docType)

    // Call the generation API
    try {
      const res = await fetch(`/api/documents/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ document_type: docType }),
      })

      if (res.ok) {
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.docType === docType
              ? { ...doc, status: 'generated' as DocStatus, lastGenerated: new Date().toISOString() }
              : doc
          )
        )
      } else {
        // Mark as draft if generation had issues
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.docType === docType
              ? { ...doc, status: 'draft' as DocStatus, lastGenerated: new Date().toISOString() }
              : doc
          )
        )
      }
    } catch {
      // Mark as draft on error (still attempted)
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.docType === docType
            ? { ...doc, status: 'draft' as DocStatus, lastGenerated: new Date().toISOString() }
            : doc
        )
      )
    }

    setGenerating(null)
  }

  async function handleGenerateAll() {
    setGeneratingAll(true)
    for (const doc of documents) {
      if (doc.status === 'pending') {
        await handleGenerate(doc.docType)
      }
    }
    setGeneratingAll(false)
  }

  async function handleDownload(documentType: string, format: 'docx' | 'pdf') {
    try {
      const res = await fetch(`/api/documents/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ document_type: documentType, format }),
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${documentType}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B2A4A] border-t-transparent" />
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

  const generatedCount = documents.filter((d) => d.status === 'generated' || d.status === 'signed').length

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href={`/dashboard/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Client
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Documents</h2>
          <p className="mt-1 text-sm text-gray-500">
            {generatedCount} of {documents.length} documents generated.
          </p>
        </div>
        <Button onClick={handleGenerateAll} disabled={generatingAll || documents.every((d) => d.status !== 'pending')}>
          {generatingAll ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Generating...
            </>
          ) : (
            <>
              <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Generate All
            </>
          )}
        </Button>
      </div>

      {/* Document Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {documents.map((doc) => {
          const statusCfg = DOC_STATUS_STYLES[doc.status]
          const isGenerating = generating === doc.docType

          return (
            <Card key={doc.docType} className={previewDoc === doc.docType ? 'ring-2 ring-[#1B2A4A]' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-50 text-2xl">
                    {doc.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{doc.shortName}</p>
                        <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{doc.name}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    </div>

                    {doc.lastGenerated && (
                      <p className="mt-2 text-xs text-gray-400">
                        Last generated: {new Date(doc.lastGenerated).toLocaleString('en-CA')}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={doc.status === 'pending' ? 'default' : 'outline'}
                        disabled={isGenerating}
                        onClick={() => handleGenerate(doc.docType)}
                      >
                        {isGenerating ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Generating...
                          </>
                        ) : doc.status === 'pending' ? (
                          'Generate'
                        ) : (
                          'Regenerate'
                        )}
                      </Button>

                      {(doc.status === 'generated' || doc.status === 'draft') && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPreviewDoc(previewDoc === doc.docType ? null : doc.docType)}
                          >
                            {previewDoc === doc.docType ? 'Hide Preview' : 'Preview'}
                          </Button>
                          <Button size="sm" variant="ghost" title="Download Word" onClick={() => handleDownload(doc.docType, 'docx')}>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            .docx
                          </Button>
                          <Button size="sm" variant="ghost" title="Download PDF" onClick={() => handleDownload(doc.docType, 'pdf')}>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            .pdf
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Preview Area */}
      {previewDoc && (
        <>
          <Separator />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Document Preview — {documents.find((d) => d.docType === previewDoc)?.shortName}
              </CardTitle>
              <CardDescription>
                This is a preview of the generated document. Final formatting may differ in Word/PDF output.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="min-h-[400px] rounded-lg border border-gray-200 bg-gray-50 p-8">
                <div className="mx-auto max-w-2xl space-y-6 text-gray-600">
                  <div className="text-center">
                    <h3 className="text-lg font-bold uppercase text-gray-900">
                      {documents.find((d) => d.docType === previewDoc)?.name}
                    </h3>
                    <Separator className="my-4" />
                  </div>
                  <p className="text-sm leading-relaxed">
                    Document preview will render here once the backend generation API is connected.
                    The generated HTML content from the clause templates will be displayed in this area,
                    preserving the proper legal document formatting.
                  </p>
                  <div className="rounded-md border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-4 text-center">
                    <p className="text-sm text-[#8a6a1e]">
                      Connect the <code className="rounded bg-[#C9A84C]/20 px-1">/api/documents/:id/generate</code> endpoint to enable full document preview.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
