/**
 * Document generation API client. Pairs with backend routes in
 * backend/routes/documents.py. Returns a blob so the caller can either
 * download or preview in-browser.
 */

import { getAuthHeaders } from '@/lib/auth'

export interface GenerateAllResult {
  blob: Blob
  filename: string
}

/**
 * Generate a ZIP of every enabled document for a draft. Mirrors the
 * POST /api/documents/{draftId}/generate-all endpoint which streams
 * application/zip with a Content-Disposition filename.
 */
export async function generateAllDocuments(draftId: string): Promise<GenerateAllResult> {
  const res = await fetch(`/api/documents/${draftId}/generate-all`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      const d = body?.detail
      if (typeof d === 'string') {
        detail = d
      } else if (d?.message) {
        // Structured 422 from the unresolved-placeholder guard.
        detail = d.message
        const byDoc = d.unresolved_by_document as Record<string, string[]> | undefined
        if (byDoc) {
          const parts = Object.entries(byDoc).map(
            ([doc, names]) => `${doc}: ${names.join(', ')}`
          )
          detail += ` Missing — ${parts.join('; ')}`
        } else if (Array.isArray(d.unresolved)) {
          detail += ` Missing — ${d.unresolved.join(', ')}`
        }
      }
    } catch {
      // body wasn't JSON — keep statusText
    }
    throw new Error(detail || 'Document generation failed')
  }
  const blob = await res.blob()
  const filename = extractFilename(res.headers.get('content-disposition')) ?? `estate-documents-${draftId}.zip`
  return { blob, filename }
}

/** Kick off a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function extractFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  return match ? decodeURIComponent(match[1]) : null
}
