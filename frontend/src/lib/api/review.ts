// API client for EZWill Client Review Portal
// Routes proxied via /api/* to ezwill-backend at :8003

export interface ReviewDocument {
  document_type: string
  title: string
  status: 'pending' | 'reviewed' | 'approved'
  clause_count: number
  approved_at: string | null
  comments_count: number
}

export interface ReviewData {
  draft_id: string
  client_name: string
  client_first_name: string
  client_last_name: string
  language: 'en' | 'ko'
  firm_name: string
  documents: ReviewDocument[]
  all_approved: boolean
}

export interface ReviewStatus {
  draft_id: string
  documents: ReviewDocument[]
  all_approved: boolean
  approved_count: number
  total_count: number
}

export interface DocumentPreview {
  document_type: string
  title: string
  html: string
  clause_count: number
  clauses: PreviewClause[]
}

export interface PreviewClause {
  clause_id: string
  section: string
  title: string
  html: string
  is_folder: boolean
  annotation?: string
  annotation_ko?: string
  statute?: string
}

// Resolve a review magic link token -> get draft info and documents
export async function resolveReviewToken(token: string): Promise<ReviewData | null> {
  try {
    const res = await fetch(`/api/review/token/${token}/resolve`, { method: 'POST' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Get HTML preview of a document with clause-level detail
export async function getDocumentPreview(
  draftId: string,
  documentType: string,
  token: string
): Promise<DocumentPreview | null> {
  try {
    const res = await fetch(
      `/api/review/${draftId}/preview/${documentType}?token=${encodeURIComponent(token)}`
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Approve a document (client action)
export async function approveDocument(
  draftId: string,
  documentType: string,
  token: string
): Promise<boolean> {
  try {
    const res = await fetch(`/api/review/${draftId}/approve/${documentType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Add a comment on a specific clause
export async function addComment(
  draftId: string,
  documentType: string,
  clauseId: string,
  comment: string,
  token: string
): Promise<boolean> {
  try {
    const res = await fetch(`/api/review/${draftId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        document_type: documentType,
        clause_id: clauseId,
        comment,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Get review status for all documents in a draft
export async function getReviewStatus(
  draftId: string,
  token: string
): Promise<ReviewStatus | null> {
  try {
    const res = await fetch(
      `/api/review/${draftId}/status?token=${encodeURIComponent(token)}`
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
