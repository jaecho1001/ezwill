import { getAuthHeaders } from '@/lib/auth'

export interface LegalSource {
  id: string
  title: string
  publisher: string
  edition_year: number
  publication_date?: string | null
  original_filename: string
  sha256: string
  page_count: number
  ingestion_status: string
}

export interface LegalSourcePage {
  id: string
  pdf_page_number: number
  printed_page_label?: string | null
  tab_label?: string | null
  inferred_heading?: string | null
  source_text: string
  text_sha256: string
}

export interface ClauseTemplateSummary {
  id: string
  clause_key: string
  heading: string
  section: string
  subsection?: string | null
  document_types: string[]
  tier: 1 | 2
  is_folder: boolean
  is_default: boolean
  lifecycle_status: string
  current_version_id?: string | null
  latest_version_id?: string | null
  latest_version_number?: number | null
  latest_version_status?: string | null
}

export interface ClauseVersion {
  id: string
  clause_template_id: string
  version_number: number
  clause_text: string
  internal_explanation?: string | null
  client_explanation?: string | null
  client_qa: Array<{ question?: string; answer?: string }>
  statute_citations: string[]
  case_citations: string[]
  applicability_rules: Record<string, unknown>
  change_summary?: string | null
  status: string
  approved_by?: string | null
  approved_at?: string | null
  created_at: string
}

export interface ClauseSourceLink {
  id: string
  clause_version_id: string
  source_document_id: string
  source_page_id?: string | null
  printed_page_label?: string | null
  relation_type: string
  internal_note?: string | null
  source_title: string
  edition_year: number
  pdf_page_number?: number | null
  inferred_heading?: string | null
}

export interface ClauseDetail {
  template: ClauseTemplateSummary
  versions: ClauseVersion[]
  source_links: ClauseSourceLink[]
}

export interface ClauseVersionInput {
  clause_text: string
  internal_explanation: string
  client_explanation: string
  client_qa: Array<{ question: string; answer: string }>
  statute_citations: string[]
  case_citations: string[]
  applicability_rules: Record<string, unknown>
  change_summary: string
  created_by?: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: string }
    throw new Error(payload.detail || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const listLegalSources = () =>
  api<{ sources: LegalSource[] }>('/api/legal-library/sources')

export const getLegalSourcePages = (sourceId: string, options: { page?: number; query?: string; limit?: number }) => {
  const params = new URLSearchParams()
  if (options.page) params.set('page', String(options.page))
  if (options.query) params.set('query', options.query)
  if (options.limit) params.set('limit', String(options.limit))
  return api<{ source: LegalSource; pages: LegalSourcePage[] }>(
    `/api/legal-library/sources/${sourceId}/pages?${params}`
  )
}

export const listLegalClauses = () =>
  api<{ clauses: ClauseTemplateSummary[] }>('/api/legal-library/clauses')

export const getLegalClause = (clauseKey: string) =>
  api<ClauseDetail>(`/api/legal-library/clauses/${encodeURIComponent(clauseKey)}`)

export const createClauseVersion = (clauseKey: string, body: ClauseVersionInput) =>
  api<{ version: ClauseVersion }>(`/api/legal-library/clauses/${encodeURIComponent(clauseKey)}/versions`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const updateClauseVersion = (versionId: string, body: ClauseVersionInput) =>
  api<{ version: ClauseVersion }>(`/api/legal-library/versions/${versionId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const linkClauseSource = (versionId: string, body: {
  source_document_id: string
  source_page_id: string
  pdf_page_number: number
  relation_type: string
  internal_note?: string
}) => api<{ source_link: ClauseSourceLink; pdf_page_number: number }>(
  `/api/legal-library/versions/${versionId}/source-links`,
  { method: 'POST', body: JSON.stringify(body) }
)

export const approveClauseVersion = (versionId: string, body: {
  reviewer_name: string
  reviewer_note?: string
}) => api<{ version: ClauseVersion }>(`/api/legal-library/versions/${versionId}/approve`, {
  method: 'POST',
  body: JSON.stringify(body),
})

export const recordClauseDecision = (versionId: string, body: {
  decision: 'request_changes' | 'reject' | 'defer'
  reviewer_name: string
  reviewer_note?: string
}) => api<{ decision: string; status: string }>(`/api/legal-library/versions/${versionId}/review-decisions`, {
  method: 'POST',
  body: JSON.stringify(body),
})
