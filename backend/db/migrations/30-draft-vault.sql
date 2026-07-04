-- Migration 30: Persist the conversational AI-intake "vault" on the draft
--
-- P0 fix (companion to 29): the AI intake writes structured facts into a
-- client-side "will vault" that was localStorage-only and never reached the
-- backend, so a client who filled out the will by chat had none of their data
-- in the generated document. Store the vault snapshot so the generator can
-- project it into {{placeholder}} variables (see vault_to_variables).

SET search_path TO firm_demo;

ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS vault JSONB DEFAULT '{}'::jsonb;
