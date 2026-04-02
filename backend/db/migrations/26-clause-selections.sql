-- Migration 26: Clause selections for Tier 2 will editing
-- Stores lawyer's clause selections per draft per document type

SET search_path TO firm_demo;

CREATE TABLE IF NOT EXISTS ew_clause_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,  -- 'single_will', 'probate_will', etc.
    clause_id TEXT NOT NULL,
    included BOOLEAN NOT NULL DEFAULT true,
    custom_text TEXT,             -- lawyer's edited HTML (overrides template)
    ai_generated BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(draft_id, document_type, clause_id)
);

CREATE INDEX idx_ew_clause_selections_draft ON ew_clause_selections(draft_id);
CREATE INDEX idx_ew_clause_selections_draft_doctype ON ew_clause_selections(draft_id, document_type);

-- Track which document types the lawyer has configured for each draft
CREATE TABLE IF NOT EXISTS ew_document_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    generated_at TIMESTAMPTZ,
    generated_file_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(draft_id, document_type)
);

CREATE INDEX idx_ew_document_configs_draft ON ew_document_configs(draft_id);
