-- Migration 38: Record how a draft was created (lawyer vs self-serve).
--
-- Payment enforcement must distinguish a lawyer-created file (billed by the
-- firm directly, outside the app) from a self-serve draft started on the
-- public site (paid online via checkout). Existing rows default to 'lawyer',
-- which preserves today's behavior for every draft created before this
-- migration: nothing already in flight suddenly demands an online payment.

SET search_path TO firm_demo;

ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'lawyer'
    CHECK (origin IN ('lawyer', 'self_serve'));
