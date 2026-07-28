-- Migration 41: Lawyer-to-client follow-up questions (issue #98).
--
-- The intake asks standardized questions; the review portal takes clause
-- comments. Nothing let a lawyer ask THIS client a specific question and
-- keep the answer on the file — that ran over email, invisible to the
-- record. A REQUIRED question that is unresolved blocks lawyer approval
-- of the document it concerns (or of every document when unscoped).

SET search_path TO firm_demo;

CREATE TABLE IF NOT EXISTS ew_client_questions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id       UUID NOT NULL REFERENCES ew_will_drafts(id) ON DELETE CASCADE,
    -- Optional targeting: a question may concern one document / clause /
    -- intake section, or the file as a whole (all NULL).
    document_type  TEXT,
    clause_id      TEXT,
    section        TEXT,
    question_text  TEXT NOT NULL,
    required       BOOLEAN NOT NULL DEFAULT false,
    status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'answered', 'resolved')),
    answer_text    TEXT,
    asked_by       TEXT NOT NULL DEFAULT 'dashboard',
    resolution_note TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    answered_at    TIMESTAMPTZ,
    resolved_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ew_client_questions_draft
    ON ew_client_questions(draft_id, status);
