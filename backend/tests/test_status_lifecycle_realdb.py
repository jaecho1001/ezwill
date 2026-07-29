"""Real-Postgres tests for the draft status lifecycle (#99).

submitted -> in_review (first generation)
in_review -> approved (every required document group lawyer-approved)
approved  -> in_review (revoked approval, clause edit, or regeneration)

The status is recomputed from evidence (what is generated / approved versus
what the client's answers require), so the tests assert convergence, not
event bookkeeping.
"""

from __future__ import annotations

import json
import os

import pytest
import psycopg2

from services import db as dbmod


SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")


@pytest.fixture(scope="module")
def dbw():
    if dbmod.get_pool() is None:
        try:
            dbmod.init_pool()
        except psycopg2.Error as exc:
            pytest.skip(f"real DB pool unavailable: {exc}")
    try:
        with dbmod.EWDbWriter(SCHEMA) as db:
            present = db.fetchone("SELECT to_regclass('ew_document_configs') AS t")
    except psycopg2.OperationalError as exc:
        pytest.skip(f"real DB unavailable: {exc}")
    if not present or not present["t"]:
        pytest.skip("ew_document_configs missing")
    yield None


def _make_submitted(db, vault: dict = None, **extra_cols) -> str:
    cols = ["client_first_name", "client_last_name", "status", "submitted_at", "vault"]
    vals = ["Life", "Cycle", "submitted", "now()", json.dumps(vault or {})]
    params = [v for v in vals if v != "now()"]
    for k, v in extra_cols.items():
        cols.append(k)
        vals.append(json.dumps(v))
        params.append(json.dumps(v))
    placeholders = ", ".join("now()" if v == "now()" else "%s" for v in vals)
    row = db.fetchone(
        f"INSERT INTO ew_will_drafts ({', '.join(cols)}) "
        f"VALUES ({placeholders}) RETURNING id",
        tuple(params),
    )
    return str(row["id"])


def _status(db, draft_id: str) -> str:
    return db.fetchone(
        "SELECT status FROM ew_will_drafts WHERE id = %s", (draft_id,)
    )["status"]


def _cleanup(db, draft_id: str) -> None:
    db.execute("DELETE FROM ew_document_configs WHERE draft_id = %s", (draft_id,))
    db.execute("DELETE FROM ew_will_drafts WHERE id = %s", (draft_id,))


def test_generation_moves_submitted_into_review(dbw):
    with dbmod.EWDbWriter(SCHEMA) as db:
        draft_id = _make_submitted(db)
        try:
            assert db.recompute_pipeline_status(draft_id) == "submitted"
            db.update_document_generated(draft_id, "simple_will_short", "/tmp/w.docx")
            assert db.recompute_pipeline_status(draft_id) == "in_review"
            assert _status(db, draft_id) == "in_review"
        finally:
            _cleanup(db, draft_id)


def test_full_approval_completes_review_and_revocation_reopens_it(dbw):
    with dbmod.EWDbWriter(SCHEMA) as db:
        draft_id = _make_submitted(db)  # no POAs requested: will + affidavit
        try:
            db.update_document_generated(draft_id, "simple_will_short", "/tmp/w.docx")
            db.update_document_generated(draft_id, "affidavit_execution", "/tmp/a.docx")
            db.set_lawyer_approval(draft_id, "simple_will_short", "Test Lawyer")
            assert db.recompute_pipeline_status(draft_id) == "in_review"

            db.set_lawyer_approval(draft_id, "affidavit_execution", "Test Lawyer")
            assert db.recompute_pipeline_status(draft_id) == "approved"
            assert _status(db, draft_id) == "approved"

            db.revoke_lawyer_approval(draft_id, "affidavit_execution")
            assert db.recompute_pipeline_status(draft_id) == "in_review"

            db.set_lawyer_approval(draft_id, "affidavit_execution", "Test Lawyer")
            assert db.recompute_pipeline_status(draft_id) == "approved"

            # Regeneration clears that document's approval -> back to review.
            db.update_document_generated(draft_id, "simple_will_short", "/tmp/w2.docx")
            assert db.recompute_pipeline_status(draft_id) == "in_review"
        finally:
            _cleanup(db, draft_id)


def test_standard_will_satisfies_the_will_group(dbw):
    """Either will style completes review — mirror of the requirement
    groups the overview queue uses."""
    with dbmod.EWDbWriter(SCHEMA) as db:
        draft_id = _make_submitted(db)
        try:
            db.update_document_generated(draft_id, "single_will", "/tmp/w.docx")
            db.update_document_generated(draft_id, "affidavit_execution", "/tmp/a.docx")
            db.set_lawyer_approval(draft_id, "single_will", "Test Lawyer")
            db.set_lawyer_approval(draft_id, "affidavit_execution", "Test Lawyer")
            assert db.recompute_pipeline_status(draft_id) == "approved"
        finally:
            _cleanup(db, draft_id)


def test_requested_poa_blocks_completion(dbw):
    with dbmod.EWDbWriter(SCHEMA) as db:
        draft_id = _make_submitted(
            db, vault={"poa": {"property": {"requested": True}}}
        )
        try:
            db.update_document_generated(draft_id, "simple_will_short", "/tmp/w.docx")
            db.update_document_generated(draft_id, "affidavit_execution", "/tmp/a.docx")
            db.set_lawyer_approval(draft_id, "simple_will_short", "Test Lawyer")
            db.set_lawyer_approval(draft_id, "affidavit_execution", "Test Lawyer")
            # The requested POA was never generated: not done.
            assert db.recompute_pipeline_status(draft_id) == "in_review"
        finally:
            _cleanup(db, draft_id)


def test_pre_submission_and_terminal_statuses_never_move(dbw):
    with dbmod.EWDbWriter(SCHEMA) as db:
        draft_id = _make_submitted(db)
        try:
            for frozen in ("link_sent", "opened", "in_progress", "signed"):
                db.execute(
                    "UPDATE ew_will_drafts SET status = %s WHERE id = %s",
                    (frozen, draft_id),
                )
                db.update_document_generated(draft_id, "simple_will_short", "/x.docx")
                assert db.recompute_pipeline_status(draft_id) == frozen
                assert _status(db, draft_id) == frozen
        finally:
            _cleanup(db, draft_id)


def test_in_review_files_stay_in_the_awaiting_queue(dbw):
    """#99 x overview: moving to in_review must NOT drop the file from the
    lawyer's awaiting-review queue."""
    with dbmod.EWDbWriter(SCHEMA) as db:
        draft_id = _make_submitted(db)
        try:
            db.update_document_generated(draft_id, "simple_will_short", "/tmp/w.docx")
            assert db.recompute_pipeline_status(draft_id) == "in_review"
            overview = db.get_pipeline_overview()
            ids = {str(r["id"]) for r in overview["awaiting_review"]["rows"]}
            assert draft_id in ids
        finally:
            _cleanup(db, draft_id)
