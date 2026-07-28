"""Real-Postgres test for the dashboard pipeline overview.

The overview is the lawyer's morning read: it must aggregate across ALL
clients — submitted files, open questions, unreleased documents, failed
deliveries — so it is tested against real rows, not mocks, and its route
must not be shadowed by the /{draft_id} catch-all.
"""

from __future__ import annotations

import os

import pytest
import psycopg2
from fastapi.testclient import TestClient

from services import db as dbmod


@pytest.fixture(scope="module")
def client():
    if dbmod.get_pool() is None:
        try:
            dbmod.init_pool()
        except psycopg2.Error as exc:
            pytest.skip(f"real DB pool unavailable: {exc}")
    try:
        with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
            present = db.fetchone("SELECT to_regclass('ew_delivery_log') AS t")
    except psycopg2.OperationalError as exc:
        pytest.skip(f"real DB unavailable: {exc}")
    if not present or not present["t"]:
        pytest.skip("migration 43 not applied")

    from main import app
    from routes.auth import verify_dashboard_token

    app.dependency_overrides[verify_dashboard_token] = lambda: "e2e-lawyer"
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(verify_dashboard_token, None)
    dbmod._pool = None


def test_overview_aggregates_across_clients(client):
    schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
    draft_ids = []
    try:
        def track(row):
            draft_ids.append(str(row["id"]))
            return str(row["id"])

        with dbmod.EWDbWriter(schema) as db:
            submitted = track(db.create_draft("Sub", "Mitted", language="en"))
            db.update_draft(submitted, {"status": "submitted"})
            asked = track(db.create_draft("Open", "Question", language="en"))
            db.create_client_question(asked, "Overview probe?", required=True)
            generated = track(db.create_draft("Un", "Released", language="en"))
            db.update_document_generated(generated, "single_will", "db://x")
            failed = track(db.create_draft("No", "Delivery", language="en"))
            db.record_delivery(failed, "questionnaire", "email",
                               "logged_only", provider_mode="stdout")

            # EXCLUSION CASES (from the feature's adversarial review):
            # (a) submitted + TRULY fully handled — every REQUIRED document
            #     (will + affidavit here; no POA requested) generated and
            #     approved — must NOT sit in 'awaiting review' forever;
            handled = track(db.create_draft("Fully", "Handled", language="en"))
            db.update_draft(handled, {"status": "submitted"})
            for doc_type in ("single_will", "affidavit_execution"):
                db.update_document_generated(handled, doc_type, "db://y")
                db.set_lawyer_approval(handled, doc_type, "Test Lawyer")
            # (a2) the SECOND review's finding 1: will approved but a
            #     REQUESTED POA never even generated — the file has work
            #     outstanding and MUST STAY in the queue. Judging only
            #     already-generated documents made this file vanish.
            partial = track(db.create_draft("Half", "DoneOnly", language="en"))
            db.update_draft(partial, {
                "status": "submitted",
                "poa_property": '{"hasAttorney": true}',
            })
            for doc_type in ("single_will", "affidavit_execution"):
                db.update_document_generated(partial, doc_type, "db://z")
                db.set_lawyer_approval(partial, doc_type, "Test Lawyer")
            # (b) a failure remediated by a LATER successful send must NOT
            #     appear as a live delivery problem.
            remediated = track(db.create_draft("Fixed", "Delivery", language="en"))
            db.record_delivery(remediated, "questionnaire", "email",
                               "failed", provider_mode="smtp")
            db.record_delivery(remediated, "questionnaire", "email",
                               "sent", provider_mode="smtp")

        res = client.get("/api/drafts/overview")
        assert res.status_code == 200, res.text  # not captured by /{draft_id}
        body = res.json()

        assert body["status_counts"].get("submitted", 0) >= 1

        review_rows = body["awaiting_review"]["rows"]
        assert any(r["id"] == draft_ids[0] for r in review_rows)
        # (a) fully handled file must have LEFT the queue.
        assert not any(r["id"] == draft_ids[4] for r in review_rows)
        # (a2) will approved but requested-POA ungenerated must REMAIN.
        assert any(r["id"] == draft_ids[5] for r in review_rows), (
            "file with an outstanding required POA vanished from the queue"
        )
        assert body["awaiting_review"]["total"] >= 2

        question_rows = body["open_questions"]["rows"]
        probe = next(q for q in question_rows if q["draft_id"] == draft_ids[1])
        assert probe["required"] is True
        assert probe["client_first_name"] == "Open"
        assert body["open_questions"]["total"] >= len(
            [q for q in question_rows if q["draft_id"] == draft_ids[1]]
        )

        assert any(r["draft_id"] == draft_ids[2]
                   for r in body["awaiting_approval"]["rows"])

        fail_rows = body["failed_deliveries"]["rows"]
        fail_row = next(r for r in fail_rows if r["draft_id"] == draft_ids[3])
        assert fail_row["status"] == "logged_only"
        # (b) remediated failure must NOT be listed as a live problem.
        assert not any(r["draft_id"] == draft_ids[6] for r in fail_rows)

        # ISO-8601 timestamps only (WebKit rejects str(datetime)).
        submitted_at = next(
            r["submitted_at"] for r in review_rows if r["id"] == draft_ids[0]
        )
        if submitted_at:
            assert "T" in submitted_at, f"not ISO-8601: {submitted_at}"
    finally:
        for draft_id in draft_ids:
            for table in ("ew_client_questions", "ew_document_configs",
                          "ew_delivery_log"):
                try:
                    with dbmod.EWDbWriter(schema) as db:
                        db.execute(f"DELETE FROM {table} WHERE draft_id = %s",
                                   (draft_id,))
                except psycopg2.Error:
                    pass
            with dbmod.EWDbWriter(schema) as db:
                db.execute("DELETE FROM ew_will_drafts WHERE id = %s",
                           (draft_id,))


def test_required_document_groups_mirror():
    """Unit-pins the server mirror of determineRequiredDocuments."""
    from services.db import required_document_groups

    # Simple estate, no POAs: one will (either style) + its affidavit.
    groups = required_document_groups({})
    assert {"single_will", "simple_will_short"} in groups
    assert {"affidavit_execution"} in groups
    assert len(groups) == 2

    # Dual-will with both POAs requested via the vault.
    groups = required_document_groups({
        "vault": {"goals": {"hasDualWill": True},
                  "poa": {"property": {"requested": True},
                          "personalCare": {"requested": True}}},
    })
    flat = [next(iter(g)) for g in groups if len(g) == 1]
    assert {"probate_will", "non_probate_will",
            "affidavit_execution_probate", "affidavit_execution_non_probate",
            "poa_property", "poa_personal_care"} <= set(flat)

    # Legacy questionnaire flags count too.
    groups = required_document_groups({
        "your_estate": {"includeDualWill": True},
        "poa_personal_care": {"hasAttorney": True},
    })
    assert {"poa_personal_care"} in groups
    assert {"probate_will"} in groups
