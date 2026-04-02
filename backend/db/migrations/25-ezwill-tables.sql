-- Migration 25: EZWill Tables
-- Creates all ew_* tables in the current schema (firm_{id})
-- Run after migration 24 (AI Reception tables)
--
-- Usage: SET search_path TO firm_demo; \i 25-ezwill-tables.sql

-- ── Will Drafts (core record) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ew_will_drafts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Cross-app identity
    ew_client_id          UUID NOT NULL DEFAULT gen_random_uuid(),
    ar_client_id          UUID,
    lt_client_id          UUID,
    cross_client_map_id   UUID,

    -- Client info (denormalized)
    client_first_name     TEXT NOT NULL DEFAULT '',
    client_last_name      TEXT NOT NULL DEFAULT '',
    client_email          TEXT,
    client_phone          TEXT,

    -- Status lifecycle
    status                TEXT NOT NULL DEFAULT 'link_sent'
                          CHECK (status IN (
                            'link_sent','opened','in_progress','submitted',
                            'in_review','approved','signed','archived'
                          )),

    -- Tier and will type
    tier                  INT NOT NULL DEFAULT 1 CHECK (tier IN (1, 2)),
    will_type             TEXT NOT NULL DEFAULT 'single'
                          CHECK (will_type IN ('single','dual_primary','dual_private')),

    -- Language
    language              TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ko')),

    -- Province
    province              TEXT NOT NULL DEFAULT 'ON',

    -- Progress tracking
    current_step          INT NOT NULL DEFAULT 0,
    completed_steps       INT[] NOT NULL DEFAULT '{}',

    -- All section data in JSONB (fast iteration, schema-flexible)
    tier2_clauses         JSONB DEFAULT '{}',

    -- Lawyer workspace
    lawyer_notes          TEXT,
    design_decisions      JSONB DEFAULT '{}',

    -- Timestamps
    submitted_at          TIMESTAMPTZ,
    reviewed_at           TIMESTAMPTZ,
    approved_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ew_will_drafts_status    ON ew_will_drafts(status);
CREATE INDEX IF NOT EXISTS idx_ew_will_drafts_ew_client ON ew_will_drafts(ew_client_id);
CREATE INDEX IF NOT EXISTS idx_ew_will_drafts_ar_client ON ew_will_drafts(ar_client_id) WHERE ar_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ew_will_drafts_updated   ON ew_will_drafts(updated_at DESC);

-- ── People ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ew_people (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id        UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN (
                      'spouse','child','beneficiary','executor','guardian',
                      'attorney_property','attorney_care','trustee',
                      'contingent_beneficiary','backup_executor','backup_attorney'
                    )),
    first_name      TEXT NOT NULL DEFAULT '',
    last_name       TEXT NOT NULL DEFAULT '',
    relationship    TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    is_minor        BOOLEAN DEFAULT false,
    birth_date      DATE,
    receives_odsp   BOOLEAN DEFAULT false,
    is_us_person    BOOLEAN DEFAULT false,
    percentage      NUMERIC(5,2),
    sort_order      INT DEFAULT 0,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ew_people_draft ON ew_people(draft_id);
CREATE INDEX IF NOT EXISTS idx_ew_people_role  ON ew_people(draft_id, role);

-- ── Assets ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ew_assets (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id                  UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    asset_type                TEXT NOT NULL CHECK (asset_type IN (
                                'real_estate','bank','investment','rrsp','tfsa',
                                'insurance','vehicle','business','resp','pension',
                                'digital','personal_property'
                              )),
    description               TEXT NOT NULL DEFAULT '',
    estimated_value           NUMERIC(15,2),
    address                   TEXT,
    institution               TEXT,
    account_number_last4      TEXT,
    beneficiary_designation   BOOLEAN DEFAULT false,
    joint_owner_name          TEXT,
    joint_owner_relationship  TEXT,
    is_resp                   BOOLEAN DEFAULT false,
    metadata                  JSONB,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ew_assets_draft ON ew_assets(draft_id);

-- ── AI Flags ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ew_ai_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id        UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    flag_id         TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
    title           TEXT NOT NULL,
    title_ko        TEXT,
    description     TEXT NOT NULL,
    description_ko  TEXT,
    statute         TEXT,
    dismissed       BOOLEAN DEFAULT false,
    dismissed_at    TIMESTAMPTZ,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (draft_id, flag_id)
);

CREATE INDEX IF NOT EXISTS idx_ew_ai_flags_draft  ON ew_ai_flags(draft_id);
CREATE INDEX IF NOT EXISTS idx_ew_ai_flags_active ON ew_ai_flags(draft_id) WHERE dismissed = false;

-- ── Client Links (magic links) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ew_client_links (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token         UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    draft_id      UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    client_email  TEXT,
    client_name   TEXT,
    sent_at       TIMESTAMPTZ DEFAULT now(),
    opened_at     TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    revoked       BOOLEAN DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ew_client_links_token    ON ew_client_links(token);
CREATE INDEX IF NOT EXISTS idx_ew_client_links_draft_id ON ew_client_links(draft_id);

-- ── Design Sheets (lawyer meeting notes) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS ew_design_sheets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id         UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    section          TEXT NOT NULL DEFAULT 'general',
    lawyer_notes     TEXT,
    design_decisions JSONB DEFAULT '{}',
    open_items       TEXT[] DEFAULT '{}',
    meeting_date     DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ew_design_sheets_draft ON ew_design_sheets(draft_id);

-- ── Trusts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ew_trusts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id              UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    trust_type            TEXT NOT NULL CHECK (trust_type IN (
                            'childrens','spousal','henson','gre','qdt'
                          )),
    beneficiary_ids       UUID[] DEFAULT '{}',
    trustee_ids           UUID[] DEFAULT '{}',
    distribution_age      INT,
    per_stirpes_language  BOOLEAN DEFAULT true,
    absolute_discretion   BOOLEAN DEFAULT false,
    qdt_election          BOOLEAN DEFAULT false,
    max_voluntary_payment NUMERIC(10,2) DEFAULT 10000,
    income_mandatory      BOOLEAN DEFAULT false,
    capital_discretionary BOOLEAN DEFAULT true,
    pre_protection        BOOLEAN DEFAULT true,
    parameters            JSONB DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Signing Events (SLRA compliance) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS ew_signing_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id          UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    document_type     TEXT NOT NULL CHECK (document_type IN (
                        'will','primary_will','private_will','poa_property','poa_personal_care'
                      )),
    signing_method    TEXT NOT NULL DEFAULT 'in_person'
                      CHECK (signing_method IN ('in_person','remote_video')),
    -- SLRA s.4 in-person
    signed_at         TIMESTAMPTZ,
    location          TEXT,
    -- Witness 1
    witness1_name     TEXT,
    witness1_address  TEXT,
    witness1_is_lso   BOOLEAN DEFAULT false,
    -- Witness 2
    witness2_name     TEXT,
    witness2_address  TEXT,
    witness2_is_lso   BOOLEAN DEFAULT false,
    -- Remote video (SLRA s.21.1)
    platform          TEXT,
    recording_url     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Document Generations (audit log) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS ew_document_generations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id        UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    document_type   TEXT NOT NULL,
    tier            INT NOT NULL DEFAULT 1,
    format          TEXT NOT NULL CHECK (format IN ('docx','pdf')),
    storage_path    TEXT,
    download_url    TEXT,
    expires_at      TIMESTAMPTZ,
    generation_params JSONB DEFAULT '{}',
    generated_by    TEXT DEFAULT 'system',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Integration Layer Amendment ───────────────────────────────────────────
-- Adds ew_client_id to ix_cross_client_map (shared integration layer table)
-- Only run once per database (not per schema)

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ix_cross_client_map'
        AND column_name = 'ew_client_id'
    ) THEN
        ALTER TABLE ix_cross_client_map ADD COLUMN ew_client_id UUID NULL;
        CREATE INDEX idx_ix_cross_client_map_ew
            ON ix_cross_client_map(ew_client_id)
            WHERE ew_client_id IS NOT NULL;
        COMMENT ON COLUMN ix_cross_client_map.ew_client_id
            IS 'EZWill client identifier — links will drafts to platform identity';
    END IF;
END $$;
