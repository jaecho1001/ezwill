-- Migration 43: Persisted delivery attempts (issue #88).
--
-- Delivery status was returned to whoever clicked the button and then
-- forgotten. The file needs the history: what we tried to send this
-- client, on which channel, through which provider mode, and whether it
-- worked — otherwise "the client never got the link" is unfalsifiable.

SET search_path TO firm_demo;

CREATE TABLE IF NOT EXISTS ew_delivery_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id      UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('questionnaire', 'review', 'question')),
    channel       TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
    status        TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'logged_only')),
    provider_mode TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ew_delivery_log_draft
    ON ew_delivery_log(draft_id, created_at DESC);
