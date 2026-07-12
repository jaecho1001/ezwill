-- Migration 34: Signing / execution events.
--
-- The ew_signing_events table has existed since migration 25 but nothing wrote
-- to it. This makes it usable: accept the document-type vocabulary the generator
-- actually produces, capture witness occupation, and add a unique key so a
-- draft's per-document signing record can be upserted.

SET search_path TO firm_demo;

-- Original CHECK used stale vocab (primary_will / private_will). Accept the
-- document types the generator emits (single/probate/non-probate will + POAs).
ALTER TABLE ew_signing_events
    DROP CONSTRAINT IF EXISTS ew_signing_events_document_type_check;

ALTER TABLE ew_signing_events
    ADD CONSTRAINT ew_signing_events_document_type_check
    CHECK (document_type IN (
        'simple_will_short','single_will','probate_will','non_probate_will',
        'poa_property','poa_personal_care',
        'will','primary_will','private_will'  -- legacy values, kept for compatibility
    ));

-- Ontario attestation blocks capture each witness's name, address AND occupation.
ALTER TABLE ew_signing_events ADD COLUMN IF NOT EXISTS witness1_occupation TEXT;
ALTER TABLE ew_signing_events ADD COLUMN IF NOT EXISTS witness2_occupation TEXT;

-- One signing record per (draft, document) so it can be upserted.
ALTER TABLE ew_signing_events
    DROP CONSTRAINT IF EXISTS ew_signing_events_draft_doc_uniq;
ALTER TABLE ew_signing_events
    ADD CONSTRAINT ew_signing_events_draft_doc_uniq UNIQUE (draft_id, document_type);

CREATE INDEX IF NOT EXISTS idx_ew_signing_events_draft
    ON ew_signing_events (draft_id);
