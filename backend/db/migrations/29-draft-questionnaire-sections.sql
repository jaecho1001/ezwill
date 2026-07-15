-- Migration 29: Persist questionnaire section answers on the draft
--
-- P0 fix: routes/drafts.py update_draft writes about_you / your_family /
-- your_estate / your_arrangements / poa_property / poa_personal_care, and the
-- document generator's _build_variables reads them — but ew_will_drafts never
-- had these columns, and db.update_draft's allow-list silently dropped them.
-- The client's questionnaire answers therefore never reached the generated
-- document. Add the JSONB columns so the section data actually persists.

SET search_path TO firm_demo;

ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS about_you JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS your_family JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS your_estate JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS your_arrangements JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS poa_property JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS poa_personal_care JSONB DEFAULT '{}'::jsonb;
