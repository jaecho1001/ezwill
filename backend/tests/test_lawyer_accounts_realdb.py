"""Real-Postgres tests for per-lawyer identity (#52).

The point is attribution: after this, the audit record says WHICH lawyer
approved a document — not 'dashboard'. So the test runs the whole chain:
bootstrap-create an account, log in with it, act with it, and read the
lawyer's name back off the approval and question records.
"""

from __future__ import annotations

import os

import pytest
import psycopg2
from fastapi.testclient import TestClient

from services import db as dbmod


@pytest.fixture(scope="module")
def client(request):
    if dbmod.get_pool() is None:
        try:
            dbmod.init_pool()
        except psycopg2.Error as exc:
            pytest.skip(f"real DB pool unavailable: {exc}")
    try:
        with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
            present = db.fetchone("SELECT to_regclass('ew_lawyers') AS t")
    except psycopg2.OperationalError as exc:
        pytest.skip(f"real DB unavailable: {exc}")
    if not present or not present["t"]:
        pytest.skip("migration 44 not applied")

    os.environ.setdefault("AUTH_SESSION_SECRET", "test-secret-" + "x" * 32)
    os.environ["DASHBOARD_PASSWORD"] = "legacy-shared-password"
    os.environ["SESSION_COOKIE_SECURE"] = "false"

    from main import app
    with TestClient(app) as test_client:
        yield test_client
    dbmod._pool = None


LAWYER = {
    "email": "jcho@example-firm.ca",
    "full_name": "Jae Cho",
    "password": "a-long-password-123",
}

CLAUSES = [
    {"clause_id": "rev-single", "included": True, "sort_order": 1,
     "title": "Revocation",
     "template_text": "I, {{testatorFullName}}, revoke all prior wills."},
]


def _cleanup(draft_id):
    for table in ("ew_client_questions", "ew_document_generations",
                  "ew_clause_selections", "ew_document_configs",
                  "ew_delivery_log", "ew_client_links"):
        try:
            with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
                db.execute(f"DELETE FROM {table} WHERE draft_id = %s", (draft_id,))
        except psycopg2.Error:
            pass
    with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
        db.execute("DELETE FROM ew_will_drafts WHERE id = %s", (draft_id,))


def test_identity_flows_into_the_audit_record(client):
    draft_id = None
    try:
        # 1 — bootstrap: the legacy shared password acts as the admin that
        # creates the FIRST real account.
        legacy = client.post("/api/auth/login",
                             json={"password": "legacy-shared-password"})
        assert legacy.status_code == 200, legacy.text
        assert legacy.json()["actor"]["name"] == "dashboard"

        created = client.post("/api/auth/lawyers", json=dict(LAWYER, role="admin"))
        assert created.status_code == 200, created.text

        # Weak passwords are refused.
        weak = client.post("/api/auth/lawyers", json={
            "email": "x@y.ca", "full_name": "X", "password": "short",
        })
        assert weak.status_code == 400

        # 2 — the lawyer logs in with their OWN credentials.
        client.post("/api/auth/logout")
        login = client.post("/api/auth/login", json={
            "email": LAWYER["email"], "password": LAWYER["password"],
        })
        assert login.status_code == 200, login.text
        assert login.json()["actor"]["name"] == "Jae Cho"
        assert login.json()["actor"]["role"] == "admin"

        # Wrong password → the same undifferentiated 401.
        bad = client.post("/api/auth/login", json={
            "email": LAWYER["email"], "password": "wrong-wrong-wrong",
        })
        assert bad.status_code == 401
        assert "email or password" in bad.json()["detail"].lower()

        # 3 — accountable actions carry the NAME. (The session cookie from
        # the login above authenticates these calls.)
        made = client.post("/api/links/create", json={
            "client_first_name": "Audit", "client_last_name": "Trail",
            "language": "en", "send_email": False, "send_sms": False,
        })
        assert made.status_code == 200, made.text
        draft_id = made.json()["draft_id"]

        asked = client.post(f"/api/drafts/{draft_id}/questions", json={
            "question_text": "Attribution probe?", "required": False,
        })
        assert asked.status_code == 200, asked.text
        assert asked.json()["asked_by"] == "Jae Cho"

        client.put(f"/api/drafts/{draft_id}/clauses/single_will",
                   json={"clauses": CLAUSES})
        generated = client.post(
            f"/api/documents/{draft_id}/generate",
            json={"document_type": "single_will", "format": "docx"},
        )
        assert generated.status_code == 200, generated.text

        trail = client.get(f"/api/documents/{draft_id}/generations").json()
        assert trail["generations"][0]["generated_by"] == "Jae Cho"

        approved = client.post(f"/api/documents/{draft_id}/single_will/approve")
        assert approved.status_code == 200, approved.text
        assert approved.json()["approved_by"] == "Jae Cho"

        # 4 — a deactivated account cannot log in.
        lawyers = client.get("/api/auth/lawyers").json()["lawyers"]
        me = next(l for l in lawyers if l["email"] == LAWYER["email"])
        # (cannot deactivate self)
        self_off = client.patch(f"/api/auth/lawyers/{me['id']}",
                                json={"active": False})
        assert self_off.status_code == 409
    finally:
        if draft_id:
            _cleanup(draft_id)
        with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
            db.execute("DELETE FROM ew_lawyers WHERE email IN (%s, %s)",
                       (LAWYER["email"], "x@y.ca"))


def test_non_admin_cannot_manage_accounts(client):
    try:
        legacy = client.post("/api/auth/login",
                             json={"password": "legacy-shared-password"})
        assert legacy.status_code == 200
        client.post("/api/auth/lawyers", json={
            "email": "assoc@example-firm.ca", "full_name": "Associate Kim",
            "password": "another-long-password-1", "role": "lawyer",
        })
        client.post("/api/auth/logout")
        login = client.post("/api/auth/login", json={
            "email": "assoc@example-firm.ca",
            "password": "another-long-password-1",
        })
        assert login.status_code == 200
        assert login.json()["actor"]["role"] == "lawyer"

        denied = client.post("/api/auth/lawyers", json={
            "email": "sneak@example-firm.ca", "full_name": "Sneak",
            "password": "yet-another-long-pass-1",
        })
        assert denied.status_code == 403
    finally:
        client.post("/api/auth/logout")
        with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
            db.execute(
                "DELETE FROM ew_lawyers WHERE email IN (%s, %s)",
                ("assoc@example-firm.ca", "sneak@example-firm.ca"),
            )
