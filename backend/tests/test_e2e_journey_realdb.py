"""End-to-end lawyer-led journey against real Postgres (issue #87).

This is the walkthrough every audit kept asking for, executed through the
REAL API surface with a REAL database — no FakeDb anywhere:

  lawyer creates a client + magic link
    → client resolves the link and saves vault answers (with revision)
    → client submits
    → lawyer's dashboard payload actually contains the answers, people,
      assets and flags (#87's headline claim)
    → lawyer saves clause selections and generates the will
    → generation is refused while the residue clause contradicts the
      client's recorded split, and succeeds once it matches
    → lawyer approves the document (#86)
    → review link can only be created after approval
    → client opens the review portal, sees ONLY the released document,
      and records approval

Every guard the last month added sits on this path; if any of them breaks,
this test is designed to fail loudly.
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
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'ew_document_configs'
                  AND column_name = 'lawyer_approved_at'
                """
            )
    except psycopg2.OperationalError as exc:
        pytest.skip(f"real DB unavailable: {exc}")
    if not present:
        pytest.skip("migration 40 not applied")

    from main import app
    from routes.auth import verify_dashboard_token

    app.dependency_overrides[verify_dashboard_token] = lambda: "e2e-lawyer"
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(verify_dashboard_token, None)
    # TestClient ran the app lifespan, whose shutdown CLOSED the shared pool
    # while dbmod._pool still pointed at the dead object — every later
    # real-DB test module then erred on getconn. Reset so they re-init.
    dbmod._pool = None


VAULT = {
    "schemaVersion": 2,
    "testator": {"fullName": "HYUN JUNG KIM", "maritalStatus": "single",
                 "email": "hj@example.com"},
    "executors": [{"id": "e1", "fullName": "Dan Cho", "isBackup": False}],
    "beneficiaries": [
        {"id": "b1", "fullName": "Grace Kim", "sharePercent": 60},
        {"id": "b2", "fullName": "Min Cho", "sharePercent": 40},
    ],
    "residueDistribution": "percentages",
    "goals": {},
    "poa": {"property": {"attorneys": []}, "personalCare": {"attorneys": []}},
}

WRONG_RESIDUE = (
    "I give the residue of my estate to my spouse if my spouse survives me."
)
RIGHT_RESIDUE = (
    "I give 60% of the residue of my estate to Grace Kim and "
    "40% of the residue of my estate to Min Cho."
)


def _clauses(residue_text: str) -> list[dict]:
    return [
        {"clause_id": "rev-single", "included": True, "sort_order": 1,
         "title": "Revocation",
         "template_text": "I, {{testatorFullName}}, revoke all prior wills."},
        {"clause_id": "res-custom", "included": True, "sort_order": 2,
         "title": "Residue", "template_text": residue_text,
         "custom_text": residue_text},
    ]


def test_full_lawyer_led_journey(client):
    created_draft = None
    try:
        # 1 — lawyer creates the client + magic link (no delivery channels).
        create = client.post("/api/links/create", json={
            "client_first_name": "Hyun Jung", "client_last_name": "Kim",
            "language": "en", "send_email": False, "send_sms": False,
        })
        assert create.status_code == 200, create.text
        created_draft = create.json()["draft_id"]
        magic_token = create.json()["token"]
        # Delivery status is honest: nothing was requested, nothing claimed.
        assert create.json()["email_delivery"] == "not_requested"

        # 2 — client resolves the link (public path, revision baseline).
        resolved = client.get(f"/api/links/{magic_token}/resolve")
        assert resolved.status_code == 200
        revision = resolved.json()["revision"]

        # 3 — client saves their answers with the revision they read.
        saved = client.put(
            f"/api/drafts/{created_draft}",
            headers={"X-Magic-Token": magic_token},
            json={"vault": VAULT, "revision": revision,
                  "client_email": "hj@example.com"},
        )
        assert saved.status_code == 200
        assert saved.json()["revision"] == revision + 1

        # 3b — a STALE device must get 409, not overwrite (issue #92).
        stale = client.put(
            f"/api/drafts/{created_draft}",
            headers={"X-Magic-Token": magic_token},
            json={"vault": {"testator": {"fullName": "WRONG"}},
                  "revision": revision},
        )
        assert stale.status_code == 409

        # 4 — client submits.
        submitted = client.post(
            f"/api/drafts/{created_draft}/submit",
            headers={"X-Magic-Token": magic_token},
        )
        assert submitted.status_code == 200

        # 5 — #87's claim: the lawyer's dashboard payload carries the intake.
        dash = client.get(f"/api/drafts/{created_draft}")
        assert dash.status_code == 200
        body = dash.json()
        assert body["vault"]["testator"]["fullName"] == "HYUN JUNG KIM"
        assert body["vault"]["beneficiaries"][0]["sharePercent"] == 60
        # The FULL lawyer payload (#87): the first journey-test version
        # asserted only a subset and the endpoint was missing the rest —
        # exactly the overstatement the second review caught.
        for key in ("people", "liabilities", "assets", "ai_flags",
                    "review_comments", "review_approvals"):
            assert key in body, f"dashboard payload missing {key}"

        # 6 — lawyer saves a residue clause CONTRADICTING the client split:
        # generation must refuse (instruction guard, end to end).
        bad = client.put(
            f"/api/drafts/{created_draft}/clauses/single_will",
            json={"clauses": _clauses(WRONG_RESIDUE)},
        )
        assert bad.status_code == 200
        blocked = client.post(
            f"/api/documents/{created_draft}/generate",
            json={"document_type": "single_will", "format": "docx"},
        )
        assert blocked.status_code == 422, blocked.text

        # ...and approval of the mismatched document is refused too (#86).
        no_approve = client.post(
            f"/api/documents/{created_draft}/single_will/approve"
        )
        assert no_approve.status_code == 422

        # 7 — with a matching residue clause, generation succeeds.
        good = client.put(
            f"/api/drafts/{created_draft}/clauses/single_will",
            json={"clauses": _clauses(RIGHT_RESIDUE)},
        )
        assert good.status_code == 200
        generated = client.post(
            f"/api/documents/{created_draft}/generate",
            json={"document_type": "single_will", "format": "docx"},
        )
        assert generated.status_code == 200, generated.text
        assert generated.content[:2] == b"PK"  # a real DOCX zip container

        # The audit trail recorded the exact delivery (#73).
        trail = client.get(f"/api/documents/{created_draft}/generations")
        assert trail.status_code == 200
        assert len(trail.json()["generations"]) == 1

        # 8 — review link refused BEFORE approval; allowed after (#86).
        premature = client.post(
            f"/api/review/link/{created_draft}?send_email=false&send_sms=false"
        )
        assert premature.status_code == 409
        approved = client.post(
            f"/api/documents/{created_draft}/single_will/approve"
        )
        assert approved.status_code == 200, approved.text
        review_link = client.post(
            f"/api/review/link/{created_draft}?send_email=false&send_sms=false"
        )
        assert review_link.status_code == 200, review_link.text
        review_token = review_link.json()["token"]

        # 9 — the client's review portal shows the released document only.
        portal = client.post(f"/api/review/token/{review_token}/resolve")
        assert portal.status_code == 200
        docs = portal.json()["documents"]
        assert [d["document_type"] for d in docs] == ["single_will"]
        assert docs[0]["status"] == "pending"

        preview = client.get(
            f"/api/review/{created_draft}/preview/single_will",
            params={"token": review_token},
        )
        assert preview.status_code == 200, preview.text
        assert "Grace Kim" in preview.text

        # 10 — client records approval.
        client_ok = client.post(
            f"/api/review/{created_draft}/approve/single_will",
            json={"token": review_token},
        )
        assert client_ok.status_code == 200, client_ok.text

        # 11 — a client comment must surface in the lawyer's payload (#87).
        commented = client.post(
            f"/api/review/{created_draft}/comment",
            json={"token": review_token, "document_type": "single_will",
                  "clause_id": "res-custom",
                  "comment": "Can we discuss the 60% share?"},
        )
        assert commented.status_code == 200, commented.text
        dash2 = client.get(f"/api/drafts/{created_draft}").json()
        assert any(
            "60% share" in c["comment_text"] for c in dash2["review_comments"]
        ), "client comment not surfaced to the lawyer"

        # 12 — editing the clauses REVOKES the lawyer approval (approval
        # integrity: the client must never read edited text under an old
        # approval — the second review demonstrated exactly that bypass).
        client.put(
            f"/api/drafts/{created_draft}/clauses/single_will",
            json={"clauses": _clauses(RIGHT_RESIDUE + " Amended.")},
        )
        listing = client.get(f"/api/documents/{created_draft}/list").json()
        will_row = next(
            d for d in listing["documents"]
            if d["document_type"] == "single_will"
        )
        assert will_row["lawyer_approved_at"] is None, (
            "clause edit did not revoke the lawyer approval"
        )
        relist = client.post(f"/api/review/token/{review_token}/resolve")
        assert relist.json()["documents"] == [], (
            "client can still see a document whose approval was revoked"
        )
    finally:
        if created_draft:
            schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
            for table in (
                "ew_review_approvals", "ew_review_comments",
                "ew_document_generations", "ew_clause_selections",
                "ew_document_configs", "ew_review_links",
                "ew_client_links", "ew_people", "ew_assets",
            ):
                # One writer per table: a failed DELETE aborts its
                # transaction, and reusing the connection would poison
                # every later cleanup statement.
                try:
                    with dbmod.EWDbWriter(schema) as db:
                        db.execute(
                            f"DELETE FROM {table} WHERE draft_id = %s",
                            (created_draft,),
                        )
                except psycopg2.Error:
                    pass  # table may not exist in this schema revision
            with dbmod.EWDbWriter(schema) as db:
                db.execute(
                    "DELETE FROM ew_will_drafts WHERE id = %s", (created_draft,)
                )
