-- Migration 27: Review tables + liabilities support
SET search_path TO firm_demo;

-- Client review approvals (from review portal)
CREATE TABLE IF NOT EXISTS ew_review_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    approved_by TEXT,  -- client name
    approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(draft_id, document_type)
);

-- Client review comments (from review portal)
CREATE TABLE IF NOT EXISTS ew_review_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    clause_id TEXT,
    comment_text TEXT NOT NULL,
    commenter_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ew_review_comments_draft ON ew_review_comments(draft_id);

-- Liabilities table
CREATE TABLE IF NOT EXISTS ew_liabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    liability_type TEXT NOT NULL,  -- mortgage, car_loan, credit_card, etc.
    description TEXT NOT NULL DEFAULT '',
    creditor TEXT,
    outstanding_balance NUMERIC,
    monthly_payment NUMERIC,
    ownership_type TEXT DEFAULT 'sole',
    joint_owner_name TEXT,
    secured_by_asset_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ew_liabilities_draft ON ew_liabilities(draft_id);

-- Add review_token column to ew_client_links for review portal access
ALTER TABLE ew_client_links ADD COLUMN IF NOT EXISTS link_type TEXT DEFAULT 'questionnaire';
-- link_type: 'questionnaire' or 'review'

-- Add liabilities JSONB to drafts for quick access (same pattern as assets)
ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS liabilities JSONB DEFAULT '[]'::jsonb;
