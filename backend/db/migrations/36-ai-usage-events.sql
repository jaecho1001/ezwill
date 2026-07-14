-- Migration 36: Persistent AI provider usage metering.
--
-- One row represents one EZWill feature invocation. `request_count` can be
-- greater than one when a single intake turn requires multiple Claude tool-use
-- iterations. Token columns are deliberately non-overlapping so they can be
-- summed into a useful total across providers.

SET search_path TO firm_demo;

CREATE TABLE IF NOT EXISTS ew_ai_usage_events (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id                    UUID REFERENCES ew_will_drafts(id) ON DELETE SET NULL,
    provider                    TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai')),
    model                       TEXT NOT NULL,
    feature                     TEXT NOT NULL,
    request_count               INT NOT NULL DEFAULT 1 CHECK (request_count >= 1),
    input_tokens                BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens               BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    cache_read_input_tokens     BIGINT NOT NULL DEFAULT 0 CHECK (cache_read_input_tokens >= 0),
    cache_creation_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (cache_creation_input_tokens >= 0),
    latency_ms                  INT CHECK (latency_ms IS NULL OR latency_ms >= 0),
    correlation_id              TEXT,
    metadata                    JSONB NOT NULL DEFAULT '{}',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ew_ai_usage_created
    ON ew_ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ew_ai_usage_provider_model
    ON ew_ai_usage_events(provider, model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ew_ai_usage_draft
    ON ew_ai_usage_events(draft_id, created_at DESC)
    WHERE draft_id IS NOT NULL;
