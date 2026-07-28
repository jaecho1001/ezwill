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
        with dbmod.EWDbWriter(schema) as db:
            submitted = db.create_draft("Sub", "Mitted", language="en")
            db.update_draft(str(submitted["id"]), {"status": "submitted"})
            asked = db.create_draft("Open", "Question", language="en")
            db.create_client_question(
                str(asked["id"]), "Overview probe?", required=True
            )
            generated = db.create_draft("Un", "Released", language="en")
            db.update_document_generated(
                str(generated["id"]), "single_will", "db://x"
            )
            failed = db.create_draft("No", "Delivery", language="en")
            db.record_delivery(str(failed["id"]), "questionnaire", "email",
                               "logged_only", provider_mode="stdout")
            draft_ids = [str(d["id"]) for d in
                         (submitted, asked, generated, failed)]

        res = client.get("/api/drafts/overview")
        assert res.status_code == 200, res.text  # not captured by /{draft_id}
        body = res.json()

        assert body["status_counts"].get("submitted", 0) >= 1
        assert any(r["id"] == draft_ids[0] for r in body["awaiting_review"])
        probe = next(q for q in body["open_questions"]
                     if q["draft_id"] == draft_ids[1])
        assert probe["required"] is True
        assert probe["client_first_name"] == "Open"
        assert any(r["draft_id"] == draft_ids[2]
                   for r in body["awaiting_approval"])
        fail_row = next(r for r in body["failed_deliveries"]
                        if r["draft_id"] == draft_ids[3])
        assert fail_row["status"] == "logged_only"
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
