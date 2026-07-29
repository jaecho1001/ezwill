"""Real-Postgres tests for persisted delivery attempts + resend (#88)."""

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


def test_delivery_attempts_are_persisted_and_resend_works(client, monkeypatch):
    import routes.links as links_route
    # stdout mode: the attempt must be recorded as logged_only, never 'sent'.
    monkeypatch.setattr(links_route, "notification_mode", lambda: "stdout")

    draft_id = None
    try:
        created = client.post("/api/links/create", json={
            "client_first_name": "Del", "client_last_name": "Log",
            "client_email": "del@example.com", "language": "en",
            "send_email": True, "send_sms": False,
        }).json()
        draft_id = created["draft_id"]
        assert created["email_delivery"] == "logged_only"

        # The attempt is on the file, honestly labelled.
        log = client.get(f"/api/drafts/{draft_id}").json()["delivery_log"]
        assert len(log) == 1
        assert (log[0]["kind"], log[0]["channel"], log[0]["status"]) == (
            "questionnaire", "email", "logged_only",
        )

        # Resend reuses the ACTIVE token (no new credential) and records
        # a second attempt.
        resent = client.post(f"/api/links/{draft_id}/resend")
        assert resent.status_code == 200, resent.text
        assert resent.json()["email_delivery"] == "logged_only"
        assert created["token"] in resent.json()["link_url"]

        log2 = client.get(f"/api/drafts/{draft_id}").json()["delivery_log"]
        assert len(log2) == 2

        # Token scoping (#91 review): a review link created LATER must not
        # hijack the questionnaire flows. Resend still mails the
        # questionnaire token, and the review token does not resolve as a
        # questionnaire credential (it would otherwise grant WRITE access
        # far beyond its read-only document-review scope).
        with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
            review_token = str(db.create_review_link(draft_id, "Del Log")["token"])
        resent3 = client.post(f"/api/links/{draft_id}/resend")
        assert resent3.status_code == 200
        assert created["token"] in resent3.json()["link_url"]
        assert review_token not in resent3.json()["link_url"]
        scoped = client.post("/api/links/resolve", json={"token": review_token})
        assert scoped.status_code == 404
    finally:
        if draft_id:
            for table in ("ew_delivery_log", "ew_client_links"):
                try:
                    with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
                        db.execute(f"DELETE FROM {table} WHERE draft_id = %s",
                                   (draft_id,))
                except psycopg2.Error:
                    pass
            with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
                db.execute("DELETE FROM ew_will_drafts WHERE id = %s", (draft_id,))
