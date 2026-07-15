-- Migration 35: Payments.
--
-- Records whether a client has paid for their estate-plan package and which
-- tier. Stripe is the processor when configured; a simulated path (no key) is
-- used for local/Ontario testing.

SET search_path TO firm_demo;

ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','pending','paid','refunded'));
ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS payment_tier TEXT;
ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
-- Processor reference (Stripe Checkout Session id, or 'simulated:<uuid>').
ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS payment_ref TEXT;
