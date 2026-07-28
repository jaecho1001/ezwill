"""Real-Postgres tests for the lawyer↔client follow-up Q&A (#98).

The whole point of the feature is accountability — question, answer,
author, timestamps, and the approval block — so these run against the
real schema through the real API, not mocks.
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
            present = db.fetchone(
                "SELECT to_regclass('ew_client_questions') AS t"
            )
    except psycopg2.OperationalError as exc:
        pytest.skip(f"real DB unavailable: {exc}")
    if not present or not present["t"]:
        pytest.skip("migration 41 not applied")

    from main import app
    from routes.auth import verify_dashboard_token

    app.dependency_overrides[verify_dashboard_token] = lambda: "e2e-lawyer"
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(verify_dashboard_token, None)
    dbmod._pool = None  # TestClient lifespan closed the shared pool


CLAUSES = [
    {"clause_id": "rev-single", "included": True, "sort_order": 1,
     "title": "Revocation",
     "template_text": "I, {{testatorFullName}}, revoke all prior wills."},
]


def test_question_lifecycle_and_approval_block(client):
    draft_id = None
    try:
        # Lawyer creates the client + link; client is reachable by token.
        created = client.post("/api/links/create", json={
            "client_first_name": "Q", "client_last_name": "Test",
            "language": "en", "send_email": False, "send_sms": False,
        }).json()
        draft_id = created["draft_id"]
        token = created["token"]

        # Lawyer asks a REQUIRED question scoped to the will.
        asked = client.post(f"/api/drafts/{draft_id}/questions", json={
            "question_text": "Is Grace a stepchild or a biological child?",
            "required": True, "document_type": "single_will",
        })
        assert asked.status_code == 200, asked.text
        question_id = asked.json()["id"]
        assert asked.json()["status"] == "open"

        # The client sees it through their magic token.
        listed = client.get(
            f"/api/drafts/{draft_id}/questions",
            headers={"X-Magic-Token": token},
        )
        assert listed.status_code == 200
        assert listed.json()["questions"][0]["question_text"].startswith("Is Grace")

        # Approval is blocked while the required question is unresolved.
        client.put(f"/api/drafts/{draft_id}/clauses/single_will",
                   json={"clauses": CLAUSES})
        generated = client.post(
            f"/api/documents/{draft_id}/generate",
            json={"document_type": "single_will", "format": "docx"},
        )
        assert generated.status_code == 200, generated.text
        blocked = client.post(f"/api/documents/{draft_id}/single_will/approve")
        assert blocked.status_code == 422
        assert blocked.json()["detail"]["error"] == "approval_blocked_open_questions"

        # Client answers; answering alone does NOT unblock (the lawyer must
        # read the answer and resolve).
        answered = client.post(
            f"/api/drafts/{draft_id}/questions/{question_id}/answer",
            headers={"X-Magic-Token": token},
            json={"answer_text": "Biological — from my first marriage."},
        )
        assert answered.status_code == 200
        assert answered.json()["status"] == "answered"
        still_blocked = client.post(
            f"/api/documents/{draft_id}/single_will/approve"
        )
        assert still_blocked.status_code == 422

        # Lawyer resolves; approval now succeeds and is BOUND to the exact
        # generation (id + sha) that was approved (migration 42).
        resolved = client.post(
            f"/api/drafts/{draft_id}/questions/{question_id}/resolve",
            json={"resolution_note": "Confirmed biological; no change needed."},
        )
        assert resolved.status_code == 200
        assert resolved.json()["status"] == "resolved"
        approved = client.post(f"/api/documents/{draft_id}/single_will/approve")
        assert approved.status_code == 200, approved.text

        listing = client.get(f"/api/documents/{draft_id}/list").json()
        row = next(d for d in listing["documents"]
                   if d["document_type"] == "single_will")
        assert row["lawyer_approved_at"] is not None
        with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
            config = db.fetchone(
                """SELECT lawyer_approved_generation_id, lawyer_approved_sha256
                   FROM ew_document_configs
                   WHERE draft_id = %s AND document_type = 'single_will'""",
                (draft_id,),
            )
            generation = db.fetchone(
                """SELECT id, content_sha256 FROM ew_document_generations
                   WHERE draft_id = %s ORDER BY created_at DESC LIMIT 1""",
                (draft_id,),
            )
        assert str(config["lawyer_approved_generation_id"]) == str(generation["id"])
        assert config["lawyer_approved_sha256"] == generation["content_sha256"]

        # Full audit trail on the question record.
        record = client.get(
            f"/api/drafts/{draft_id}/questions",
            headers={"X-Magic-Token": token},
        ).json()["questions"][0]
        assert record["answer_text"].startswith("Biological")
        assert record["resolution_note"].startswith("Confirmed")
        assert record["answered_at"] and record["resolved_at"]
    finally:
        if draft_id:
            for table in ("ew_client_questions", "ew_document_generations",
                          "ew_clause_selections", "ew_document_configs",
                          "ew_client_links"):
                try:
                    with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
                        db.execute(f"DELETE FROM {table} WHERE draft_id = %s",
                                   (draft_id,))
                except psycopg2.Error:
                    pass
            with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
                db.execute("DELETE FROM ew_will_drafts WHERE id = %s", (draft_id,))


def test_client_cannot_answer_another_drafts_question(client):
    ids = {}
    try:
        for key in ("a", "b"):
            created = client.post("/api/links/create", json={
                "client_first_name": key.upper(), "client_last_name": "Iso",
                "language": "en", "send_email": False, "send_sms": False,
            }).json()
            ids[key] = created

        asked = client.post(f"/api/drafts/{ids['a']['draft_id']}/questions", json={
            "question_text": "Private question for A", "required": False,
        }).json()

        # Client B (their own valid token) tries to answer A's question
        # through A's draft URL: draft-bound token check must refuse.
        forged = client.post(
            f"/api/drafts/{ids['a']['draft_id']}/questions/{asked['id']}/answer",
            headers={"X-Magic-Token": ids["b"]["token"]},
            json={"answer_text": "B was here"},
        )
        assert forged.status_code == 403
    finally:
        for key in ids.values():
            for table in ("ew_client_questions", "ew_client_links"):
                try:
                    with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
                        db.execute(f"DELETE FROM {table} WHERE draft_id = %s",
                                   (key["draft_id"],))
                except psycopg2.Error:
                    pass
            with dbmod.EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
                db.execute("DELETE FROM ew_will_drafts WHERE id = %s",
                           (key["draft_id"],))
