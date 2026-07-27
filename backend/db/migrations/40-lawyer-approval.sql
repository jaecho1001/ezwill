-- Migration 40: Recorded lawyer approval per document (issue #86).
--
-- The firm's standing rule is that AI drafts and a lawyer decides — but no
-- code path ever recorded a lawyer's decision. A document reached the client
-- review portal because it was GENERATED, not because anyone approved it.
-- These columns make approval an explicit, recorded act, and the review
-- portal now refuses to create links for (or display) unapproved documents.
--
-- lawyer_approved_by stores the actor label available today (the shared
-- dashboard identity). When per-lawyer accounts land (issue #52) this column
-- starts carrying a real name with no further migration.

SET search_path TO firm_demo;

ALTER TABLE ew_document_configs ADD COLUMN IF NOT EXISTS lawyer_approved_at TIMESTAMPTZ;
ALTER TABLE ew_document_configs ADD COLUMN IF NOT EXISTS lawyer_approved_by TEXT;
