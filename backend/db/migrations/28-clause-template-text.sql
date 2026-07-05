-- Migration 28: Persist clause body text + structure on clause selections
--
-- P0 fix: the backend document generator reads each clause's body from
-- template_text / custom_text, but ew_clause_selections only stored custom_text
-- (the lawyer's manual edit). Any clause the lawyer did not hand-edit therefore
-- exported with an EMPTY body. We now persist the default template_text (plus
-- the clause title and folder flag) so a complete Ontario will renders even
-- when the lawyer never touched the editor.

SET search_path TO firm_demo;

ALTER TABLE ew_clause_selections
    ADD COLUMN IF NOT EXISTS template_text TEXT;

ALTER TABLE ew_clause_selections
    ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE ew_clause_selections
    ADD COLUMN IF NOT EXISTS is_folder BOOLEAN NOT NULL DEFAULT false;
