-- Migration 31: Firm settings persistence
--
-- The dashboard settings page (firm name, address, LSO#, will defaults,
-- notifications, branding) saved to localStorage only — settings vanished on a
-- different browser/device and never reached the backend that generates
-- documents and sends client emails. Store a single settings blob per firm
-- schema so those values persist and can flow into the generated documents.

SET search_path TO firm_demo;

CREATE TABLE IF NOT EXISTS ew_firm_settings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
