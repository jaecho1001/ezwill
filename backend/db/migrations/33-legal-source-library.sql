-- Migration 33: Private legal-source library and immutable clause versions.
--
-- Licensed source text is stored separately from firm-authored lawyer/client
-- content. Client-facing APIs must never select from ew_legal_source_pages.

SET search_path TO firm_demo;

CREATE TABLE IF NOT EXISTS ew_legal_source_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               TEXT NOT NULL,
    publisher           TEXT NOT NULL,
    edition_year        INTEGER NOT NULL CHECK (edition_year BETWEEN 1900 AND 2200),
    publication_date    DATE,
    source_type         TEXT NOT NULL DEFAULT 'annotated_will',
    original_filename   TEXT NOT NULL,
    mime_type           TEXT NOT NULL,
    sha256              TEXT NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    private_storage_uri TEXT,
    page_count          INTEGER CHECK (page_count IS NULL OR page_count > 0),
    access_scope        TEXT NOT NULL DEFAULT 'lawyer_internal'
                        CHECK (access_scope IN ('lawyer_internal', 'legal_admin')),
    licence_note        TEXT,
    ingestion_status    TEXT NOT NULL DEFAULT 'pending'
                        CHECK (ingestion_status IN ('pending', 'processing', 'ready', 'failed')),
    ingestion_error     TEXT,
    imported_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ew_legal_source_pages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id  UUID NOT NULL REFERENCES ew_legal_source_documents(id) ON DELETE CASCADE,
    pdf_page_number     INTEGER NOT NULL CHECK (pdf_page_number > 0),
    printed_page_label  TEXT,
    tab_label           TEXT,
    inferred_heading    TEXT,
    source_text         TEXT NOT NULL,
    text_sha256         TEXT NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
    extraction_method   TEXT NOT NULL DEFAULT 'pdftotext',
    extraction_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    search_vector       TSVECTOR GENERATED ALWAYS AS (
                            to_tsvector('english', coalesce(inferred_heading, '') || ' ' || source_text)
                        ) STORED,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_document_id, pdf_page_number)
);

CREATE INDEX IF NOT EXISTS idx_ew_legal_source_pages_document
    ON ew_legal_source_pages(source_document_id, pdf_page_number);
CREATE INDEX IF NOT EXISTS idx_ew_legal_source_pages_search
    ON ew_legal_source_pages USING GIN(search_vector);

CREATE TABLE IF NOT EXISTS ew_clause_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clause_key          TEXT NOT NULL UNIQUE,
    heading             TEXT NOT NULL,
    section             TEXT NOT NULL,
    subsection          TEXT,
    document_types      TEXT[] NOT NULL DEFAULT ARRAY['all']::text[],
    tier                INTEGER NOT NULL CHECK (tier IN (1, 2)),
    is_folder           BOOLEAN NOT NULL DEFAULT false,
    is_default          BOOLEAN NOT NULL DEFAULT false,
    lifecycle_status    TEXT NOT NULL DEFAULT 'active'
                        CHECK (lifecycle_status IN ('active', 'under_review', 'retired')),
    current_version_id  UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ew_clause_template_versions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clause_template_id    UUID NOT NULL REFERENCES ew_clause_templates(id) ON DELETE CASCADE,
    version_number        INTEGER NOT NULL CHECK (version_number > 0),
    clause_text           TEXT NOT NULL DEFAULT '',
    internal_explanation  TEXT,
    client_explanation    TEXT,
    client_qa             JSONB NOT NULL DEFAULT '[]'::jsonb,
    statute_citations     TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    case_citations        TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    applicability_rules   JSONB NOT NULL DEFAULT '{}'::jsonb,
    change_summary        TEXT,
    content_sha256        TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'in_review', 'approved', 'superseded', 'rejected')),
    effective_from        DATE,
    superseded_at         TIMESTAMPTZ,
    created_by            TEXT,
    approved_by           TEXT,
    approved_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(clause_template_id, version_number)
);

ALTER TABLE ew_clause_templates
    DROP CONSTRAINT IF EXISTS ew_clause_templates_current_version_fk;
ALTER TABLE ew_clause_templates
    ADD CONSTRAINT ew_clause_templates_current_version_fk
    FOREIGN KEY (current_version_id) REFERENCES ew_clause_template_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ew_clause_versions_template
    ON ew_clause_template_versions(clause_template_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_ew_clause_versions_status
    ON ew_clause_template_versions(status);

CREATE TABLE IF NOT EXISTS ew_clause_source_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clause_version_id   UUID NOT NULL REFERENCES ew_clause_template_versions(id) ON DELETE CASCADE,
    source_document_id  UUID NOT NULL REFERENCES ew_legal_source_documents(id) ON DELETE CASCADE,
    source_page_id      UUID REFERENCES ew_legal_source_pages(id) ON DELETE SET NULL,
    printed_page_label  TEXT,
    relation_type       TEXT NOT NULL DEFAULT 'research_basis'
                        CHECK (relation_type IN ('research_basis', 'supports', 'changes', 'conflicts', 'supersedes')),
    internal_note       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(clause_version_id, source_document_id, source_page_id, relation_type)
);

CREATE TABLE IF NOT EXISTS ew_clause_review_decisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clause_version_id   UUID NOT NULL REFERENCES ew_clause_template_versions(id) ON DELETE CASCADE,
    decision            TEXT NOT NULL CHECK (decision IN ('approve', 'request_changes', 'reject', 'defer')),
    reviewer_name       TEXT NOT NULL,
    reviewer_note       TEXT,
    decided_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ew_annual_source_reviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id  UUID NOT NULL REFERENCES ew_legal_source_documents(id) ON DELETE CASCADE,
    prior_document_id   UUID REFERENCES ew_legal_source_documents(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'extracting', 'mapping', 'lawyer_review', 'completed', 'failed')),
    ai_change_summary   TEXT,
    lawyer_summary      TEXT,
    reviewed_by         TEXT,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_document_id)
);

COMMENT ON COLUMN ew_legal_source_pages.source_text IS
    'Licensed internal source text. Never expose through client-facing APIs.';
COMMENT ON COLUMN ew_clause_template_versions.client_explanation IS
    'Firm-authored, lawyer-approved educational content only; not licensed commentary or legal advice.';
