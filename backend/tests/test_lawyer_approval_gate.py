"""Lawyer approval gate tests (issue #86).

The firm's standing rule is AI drafts, a lawyer decides. Before this gate no
code path recorded a lawyer's decision: documents reached the client review
portal because they were GENERATED. These tests pin the new invariants:

- a client can never list, preview, approve, or comment on an unreleased doc;
- a review link cannot be created while nothing is approved;
- approval requires a generated document and re-runs the delivery guards;
- re-generation clears the approval (the approved text no longer exists).
"""

from __future__ import annotations

import os
import sys

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import documents as documents_route
from routes import review as review_route
from routes.auth import verify_dashboard_token


DRAFT = {
    "id": "draft-1",
    "client_first_name": "Hyun Jung",
    "client_last_name": "Kim",
    "province": "ON",
    "language": "en",
    "people": [],
    "vault": {},
}

CLAUSES = [{
    "clause_id": "revocation",
    "included": True,
    "templateText": "I, {{testatorFullName}}, revoke all prior wills.",
    "sortOrder": 1,
    "title": "Revocation",
}]


class FakeDb:
    def recompute_pipeline_status(self, draft_id):
        # #99 wiring pin: routes must recompute after generate/approve/
        # revoke/clause-save. Tests can assert on status_recomputes.
        self.status_recomputes = getattr(self, 'status_recomputes', [])
        self.status_recomputes.append(draft_id)
        return 'in_review'

    configs: list = []
    approvals: list = []
    approval_calls: list = []
    revoke_calls: list = []

    def __init__(self, schema: str):
        self.schema = schema

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return None

    def get_document_configs(self, draft_id):
        return list(type(self).configs)

    def get_clause_selections(self, draft_id, document_type):
        return list(CLAUSES)

    def get_all_clause_selections(self, draft_id):
        return {"single_will": list(CLAUSES)}

    def get_firm_settings(self):
        return {}

    def get_signing_events(self, draft_id):
        return []

    def unresolved_required_questions(self, draft_id, document_type=None):
        return []

    def get_review_approvals(self, draft_id):
        return list(type(self).approvals)

    def get_review_comments(self, draft_id):
        return []

    def set_lawyer_approval(self, draft_id, document_type, approved_by):
        type(self).approval_calls.append((draft_id, document_type, approved_by))
        config = next(
            (c for c in type(self).configs
             if c["document_type"] == document_type), None
        )
        if not config or not config.get("generated_at"):
            return None
        return {
            "document_type": document_type,
            "lawyer_approved_at": "2026-07-27T00:00:00Z",
            "lawyer_approved_by": approved_by,
        }

    def revoke_lawyer_approval(self, draft_id, document_type):
        type(self).revoke_calls.append((draft_id, document_type))
        return True

    def create_review_link(self, draft_id, client_name, language):
        return {"token": "rev-token", "expires_at": "2026-08-27"}


@pytest.fixture
def docs_client(monkeypatch):
    monkeypatch.setattr(documents_route, "EWDbWriter", FakeDb)
    monkeypatch.setattr(
        documents_route, "get_full_draft", lambda draft_id, schema: dict(DRAFT)
    )
    FakeDb.approval_calls = []
    FakeDb.revoke_calls = []
    app = FastAPI()
    app.include_router(documents_route.router, prefix="/api/documents")
    app.dependency_overrides[verify_dashboard_token] = lambda: "test-token"
    return TestClient(app)


# ── approving ────────────────────────────────────────────────────────────────

def test_cannot_approve_before_generating(docs_client):
    FakeDb.configs = [{"document_type": "single_will", "enabled": True,
                       "generated_at": None}]
    res = docs_client.post("/api/documents/draft-1/single_will/approve")
    assert res.status_code == 409


def test_approve_records_actor_and_time(docs_client):
    FakeDb.configs = [{"document_type": "single_will", "enabled": True,
                       "generated_at": "2026-07-27"}]
    res = docs_client.post("/api/documents/draft-1/single_will/approve")
    assert res.status_code == 200
    assert res.json()["approved"] is True
    # The actor dependency composes over the overridden verify_dashboard_token,
    # so the test override's token string surfaces as the recorded actor (#52).
    assert FakeDb.approval_calls == [("draft-1", "single_will", "test-token")]


def test_approve_and_revoke_recompute_draft_status(docs_client):
    """#99 wiring: approval and revocation must both trigger the lifecycle
    recompute — without it a fully-approved file never reaches 'approved'
    and a revoked one never returns to 'in_review'."""
    FakeDb.configs = [{"document_type": "single_will", "enabled": True,
                       "generated_at": "2026-07-27"}]
    res = docs_client.post("/api/documents/draft-1/single_will/approve")
    assert res.status_code == 200
    assert res.json()["draft_status"] == "in_review"

    res = docs_client.delete("/api/documents/draft-1/single_will/approve")
    assert res.status_code == 200
    assert res.json()["draft_status"] == "in_review"


def test_approval_blocked_by_instruction_gaps(docs_client, monkeypatch):
    # A lawyer must not be able to approve a document the system itself
    # refuses to deliver.
    FakeDb.configs = [{"document_type": "single_will", "enabled": True,
                       "generated_at": "2026-07-27"}]
    mismatched = dict(DRAFT, vault={
        "beneficiaries": [{"id": "b1", "fullName": "Grace Kim", "sharePercent": 100}],
        "residueDistribution": "percentages",
    })
    monkeypatch.setattr(
        documents_route, "get_full_draft", lambda draft_id, schema: mismatched
    )
    res = docs_client.post("/api/documents/draft-1/single_will/approve")
    assert res.status_code == 422
    assert res.json()["detail"]["error"] == "approval_blocked"
    assert FakeDb.approval_calls == []


# ── the client-side gate ─────────────────────────────────────────────────────

def _review_ctx(monkeypatch):
    monkeypatch.setattr(review_route, "EWDbWriter", FakeDb)
    monkeypatch.setattr(
        review_route, "get_full_draft", lambda draft_id, schema: dict(DRAFT)
    )


def test_unreleased_document_is_hidden_and_unreachable(monkeypatch):
    _review_ctx(monkeypatch)
    FakeDb.configs = [{"document_type": "single_will", "enabled": True,
                       "generated_at": "2026-07-27", "lawyer_approved_at": None}]
    with pytest.raises(HTTPException) as exc:
        review_route._validate_review_target("draft-1", "single_will")
    assert exc.value.status_code == 403
    assert exc.value.detail["error"] == "not_released"


def test_released_document_passes_the_target_gate(monkeypatch):
    _review_ctx(monkeypatch)
    FakeDb.configs = [{"document_type": "single_will", "enabled": True,
                       "generated_at": "2026-07-27",
                       "lawyer_approved_at": "2026-07-27T01:00:00Z"}]
    review_route._validate_review_target("draft-1", "single_will")


def test_review_link_refused_until_something_is_approved(monkeypatch):
    _review_ctx(monkeypatch)
    FakeDb.configs = [{"document_type": "single_will", "enabled": True,
                       "generated_at": "2026-07-27", "lawyer_approved_at": None}]
    app = FastAPI()
    app.include_router(review_route.router, prefix="/api/review")
    app.dependency_overrides[verify_dashboard_token] = lambda: "test-token"
    client = TestClient(app)
    res = client.post("/api/review/link/draft-1?send_email=false&send_sms=false")
    assert res.status_code == 409
    assert res.json()["detail"]["error"] == "nothing_approved"


def test_regeneration_must_clear_approval():
    # Contract-level pin: update_document_generated's SQL clears both
    # approval columns, so a regenerated document is never silently
    # treated as already approved.
    import inspect
    from services.db import EWDbWriter
    source = inspect.getsource(EWDbWriter.update_document_generated)
    assert "lawyer_approved_at = NULL" in source
    assert "lawyer_approved_by = NULL" in source


def test_clause_save_revokes_approval_sql_contract():
    # The review portal renders LIVE clause selections, so a clause edit
    # after approval must revoke it — otherwise document A is approved and
    # edited document B reaches the client under A's approval.
    import inspect
    from services.db import EWDbWriter
    source = inspect.getsource(EWDbWriter.save_clause_selections)
    assert "lawyer_approved_at = NULL" in source
    assert "lawyer_approved_by = NULL" in source


def test_review_gate_catches_literals_and_stray_tokens(monkeypatch):
    # Second review round: a literal '[Client Name]' or a malformed
    # '{{ token }}' in clause text slipped past the collector-only check.
    monkeypatch.setattr(review_route, "EWDbWriter", FakeDb)
    draft = dict(DRAFT)
    clauses = [{
        "clause_id": "x", "included": True,
        "template_text": "I leave everything to [Client Name] and {{ broken }}.",
    }]
    missing = review_route._unresolved_clause_placeholders(draft, clauses)
    assert "[Client Name]" in missing
    assert "{{ broken }}" in missing
