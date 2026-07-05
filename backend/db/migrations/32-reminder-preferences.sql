-- Migration 32: Persist client reminder preferences and GHL sync metadata.

SET search_path TO firm_demo;

ALTER TABLE ew_will_drafts
    ADD COLUMN IF NOT EXISTS reminder_preferences JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT,
    ADD COLUMN IF NOT EXISTS reminders_synced_at TIMESTAMPTZ;
