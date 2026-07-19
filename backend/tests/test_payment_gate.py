"""Payment gate tests.

The pricing page advertises paid packages, but until now nothing server-side
ever read payment_status — documents generated for free. These tests pin the
gate policy: self-serve drafts must be paid before delivery, lawyer-created
drafts stay exempt (the firm bills those outside the app), refunded counts as
unpaid, and the explicit override works but never silently.
"""

from __future__ import annotations

import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.payment_gate import payment_required, enforcement_mode
from routes import documents as documents_route
from routes.auth import verify_dashboard_token


# ── policy unit tests ────────────────────────────────────────────────────────

def test_lawyer_draft_is_exempt_under_default_policy(monkeypatch):
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    assert payment_required({"origin": "lawyer", "payment_status": "unpaid"}) is False


def test_self_serve_unpaid_requires_payment(monkeypatch):
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    assert payment_required({"origin": "self_serve", "payment_status": "unpaid"}) is True


def test_self_serve_pending_still_requires_payment(monkeypatch):
    # "pending" means checkout started but never completed — not paid.
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    assert payment_required({"origin": "self_serve", "payment_status": "pending"}) is True


def test_self_serve_paid_passes(monkeypatch):
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    assert payment_required({"origin": "self_serve", "payment_status": "paid"}) is False


def test_refunded_counts_as_unpaid(monkeypatch):
    # A refunded client must not keep generating documents.
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    assert payment_required({"origin": "self_serve", "payment_status": "refunded"}) is True


def test_pre_migration_row_without_origin_is_exempt(monkeypatch):
    # Rows created before migration 38 must behave exactly as before.
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    assert payment_required({"payment_status": "unpaid"}) is False
    assert payment_required({"origin": None, "payment_status": "unpaid"}) is False


def test_mode_off_disables_gating(monkeypatch):
    monkeypatch.setenv("PAYMENT_ENFORCEMENT", "off")
    assert payment_required({"origin": "self_serve", "payment_status": "unpaid"}) is False


def test_mode_all_gates_lawyer_drafts_too(monkeypatch):
    monkeypatch.setenv("PAYMENT_ENFORCEMENT", "all")
    assert payment_required({"origin": "lawyer", "payment_status": "unpaid"}) is True
    assert payment_required({"origin": "lawyer", "payment_status": "paid"}) is False


def test_unknown_mode_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("PAYMENT_ENFORCEMENT", "banana")
    assert enforcement_mode() == "self_serve"


# ── route enforcement ────────────────────────────────────────────────────────

CLAUSE_COMPLETE = [{
    "clause_id": "revocation",
    "included": True,
    "templateText": "I, {{testatorFullName}}, revoke all prior wills.",
    "sortOrder": 1,
    "title": "Revocation",
}]


class FakeDb:
    def __init__(self, schema: str):
        self.schema = schema

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return None

    def get_clause_selections(self, draft_id, document_type):
        return list(CLAUSE_COMPLETE)

    def get_all_clause_selections(self, draft_id):
        return {"single_will": list(CLAUSE_COMPLETE)}

    def get_document_configs(self, draft_id):
        return []

    def get_firm_settings(self):
        return {}

    def record_document_generation(self, draft_id, document_type, file_format,
                                   content, generated_by="dashboard", params=None):
        return {
            "id": "gen-1", "created_at": "now",
            "storage_path": "db://ew_document_generations/gen-1",
            "content_sha256": "x", "byte_size": len(content),
        }

    def update_document_generated(self, draft_id, document_type, file_path):
        return True


def _client(monkeypatch, draft: dict) -> TestClient:
    monkeypatch.setattr(documents_route, "EWDbWriter", FakeDb)
    monkeypatch.setattr(documents_route, "get_full_draft", lambda draft_id, schema: dict(draft))
    app = FastAPI()
    app.include_router(documents_route.router, prefix="/api/documents")
    app.dependency_overrides[verify_dashboard_token] = lambda: "test-token"
    return TestClient(app)


SELF_SERVE_UNPAID = {
    "id": "draft-1",
    "client_first_name": "Hyun Jung",
    "client_last_name": "Kim",
    "province": "ON",
    "people": [],
    "origin": "self_serve",
    "payment_status": "unpaid",
}


def test_generate_402s_for_unpaid_self_serve_draft(monkeypatch):
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    client = _client(monkeypatch, SELF_SERVE_UNPAID)
    res = client.post(
        "/api/documents/draft-1/generate",
        json={"document_type": "single_will", "format": "docx"},
    )
    assert res.status_code == 402
    assert res.json()["detail"]["error"] == "payment_required"


def test_generate_all_402s_for_unpaid_self_serve_draft(monkeypatch):
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    client = _client(monkeypatch, SELF_SERVE_UNPAID)
    res = client.post("/api/documents/draft-1/generate-all")
    assert res.status_code == 402


def test_generate_passes_once_paid(monkeypatch):
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    client = _client(monkeypatch, {**SELF_SERVE_UNPAID, "payment_status": "paid"})
    res = client.post(
        "/api/documents/draft-1/generate",
        json={"document_type": "single_will", "format": "docx"},
    )
    assert res.status_code == 200


def test_generate_passes_for_lawyer_draft(monkeypatch):
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    client = _client(monkeypatch, {**SELF_SERVE_UNPAID, "origin": "lawyer"})
    res = client.post(
        "/api/documents/draft-1/generate",
        json={"document_type": "single_will", "format": "docx"},
    )
    assert res.status_code == 200


def test_explicit_override_delivers_unpaid_draft(monkeypatch):
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)
    client = _client(monkeypatch, SELF_SERVE_UNPAID)
    res = client.post(
        "/api/documents/draft-1/generate?override_payment=true",
        json={"document_type": "single_will", "format": "docx"},
    )
    assert res.status_code == 200


def test_payment_gate_runs_before_placeholder_guard(monkeypatch):
    # Ordering matters: an unpaid client should get 402, not a 422 that leaks
    # which placeholder data the draft is missing.
    monkeypatch.delenv("PAYMENT_ENFORCEMENT", raising=False)

    class EmptyClauseDb(FakeDb):
        def get_clause_selections(self, draft_id, document_type):
            return [{
                "clause_id": "x", "included": True, "sortOrder": 1,
                "templateText": "{{primaryExecutorFullName}}", "title": "",
            }]

    monkeypatch.setattr(documents_route, "EWDbWriter", EmptyClauseDb)
    monkeypatch.setattr(
        documents_route, "get_full_draft", lambda draft_id, schema: dict(SELF_SERVE_UNPAID)
    )
    app = FastAPI()
    app.include_router(documents_route.router, prefix="/api/documents")
    app.dependency_overrides[verify_dashboard_token] = lambda: "test-token"
    res = TestClient(app).post(
        "/api/documents/draft-1/generate",
        json={"document_type": "single_will", "format": "docx"},
    )
    assert res.status_code == 402
