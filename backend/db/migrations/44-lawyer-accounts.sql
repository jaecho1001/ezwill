-- Migration 44: Individual lawyer accounts (issue #52).
--
-- The dashboard has run on ONE shared password, so no audit record could
-- say WHICH lawyer approved a document, asked a client a question, or
-- generated a file — approved_by literally said "dashboard". This table
-- gives each lawyer their own login; sessions carry the lawyer's identity
-- and every accountable action records it.
--
-- The shared-password login keeps working during the transition (it acts
-- as the bootstrap admin and logs a deprecation warning); SSO (Google/
-- Microsoft) remains #52's follow-up scope on top of these accounts.

SET search_path TO firm_demo;

CREATE TABLE IF NOT EXISTS ew_lawyers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'lawyer' CHECK (role IN ('lawyer', 'admin')),
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);
