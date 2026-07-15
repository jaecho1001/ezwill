-- Base database objects needed before the EZWill schema migrations run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS firm_demo;

CREATE TABLE IF NOT EXISTS public.ix_cross_client_map (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ar_client_id UUID,
    lt_client_id UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
