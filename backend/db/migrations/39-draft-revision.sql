-- Migration 39: Optimistic-concurrency revision counter on drafts.
--
-- Two devices (or a lawyer and a client) editing the same draft had no
-- conflict detection: the last write silently erased the other's answers,
-- and the intake's ~1.2s autosave made that race routine (issue #92).
-- Every draft update now bumps `revision`; a writer that presents a stale
-- revision gets a 409 and re-hydrates instead of overwriting.
-- Existing rows start at 0, which preserves behaviour for writers that do
-- not yet send a revision (they update unconditionally, as before).

SET search_path TO firm_demo;

ALTER TABLE ew_will_drafts ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 0;
