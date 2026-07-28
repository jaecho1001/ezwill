-- Migration 42: Bind lawyer approval to the exact generated version (#86).
--
-- Clause edits already revoke approval, which closes the live-render
-- bypass. This adds the durable audit half: the approval row records WHICH
-- generation (id + SHA-256) the lawyer approved, so the file can always
-- show "this approval was of exactly these bytes" — and a mismatch between
-- the approved checksum and the latest generation is detectable forever.

SET search_path TO firm_demo;

ALTER TABLE ew_document_configs
    ADD COLUMN IF NOT EXISTS lawyer_approved_generation_id UUID;
ALTER TABLE ew_document_configs
    ADD COLUMN IF NOT EXISTS lawyer_approved_sha256 TEXT;
