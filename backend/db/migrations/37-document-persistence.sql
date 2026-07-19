-- Migration 37: Persist generated documents (legal audit trail).
--
-- ew_document_generations (migration 25) was created but nothing ever wrote
-- to it: generated DOCX/PDF bytes were streamed to the caller and discarded,
-- leaving no record of what a client was actually given, reviewed, or signed.
-- Store the exact delivered bytes plus a SHA-256 checksum so any later copy
-- of a document can be verified against what the system produced.

SET search_path TO firm_demo;

ALTER TABLE ew_document_generations ADD COLUMN IF NOT EXISTS content BYTEA;
ALTER TABLE ew_document_generations ADD COLUMN IF NOT EXISTS content_sha256 TEXT;
ALTER TABLE ew_document_generations ADD COLUMN IF NOT EXISTS byte_size INTEGER;

CREATE INDEX IF NOT EXISTS idx_ew_document_generations_draft
    ON ew_document_generations(draft_id, created_at DESC);
