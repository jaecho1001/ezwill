"""Legal-source ingestion and access-boundary regression tests."""

from __future__ import annotations

import os
import sys
import asyncio

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import legal_library
from scripts import import_legal_source


def test_legal_source_routes_require_dashboard_auth():
    app = FastAPI()
    app.include_router(legal_library.router, prefix="/api/legal-library")
    client = TestClient(app)

    assert client.get("/api/legal-library/sources").status_code == 401
    assert client.get("/api/legal-library/clauses").status_code == 401
    assert client.get("/api/legal-library/sources/source-id/pages").status_code == 401


def test_pdf_page_extraction_preserves_page_numbers(monkeypatch, tmp_path):
    source = tmp_path / "source.pdf"
    source.write_bytes(b"not-used-by-mocked-tool")

    monkeypatch.setattr(
        import_legal_source,
        "run_tool",
        lambda *command: "FIRST PAGE\nBody\fSECOND PAGE\nBody\f",
    )

    assert import_legal_source.extract_pdf_pages(source, 3) == [
        "FIRST PAGE\nBody",
        "SECOND PAGE\nBody",
        "",
    ]


def test_heading_inference_prefers_descriptive_uppercase_heading():
    text = "The Annotated Will 2025\n42\n\nTRUSTEE COMPENSATION\nDescription of clause"
    assert import_legal_source.infer_heading(text) == "Trustee Compensation"


def test_clause_hash_changes_when_firm_text_changes():
    original = {
        "templateText": "Original firm wording",
        "annotation": "Purpose",
        "applicableWhen": {"hasSpouse": True},
    }
    revised = {**original, "templateText": "Revised firm wording"}

    assert import_legal_source.canonical_clause_hash(original) != import_legal_source.canonical_clause_hash(revised)


class _ApprovalDb:
    def __init__(self, requirements):
        self.requirements = requirements

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def fetchone(self, query, params=None):
        if "SELECT id, clause_template_id, status" in query:
            return {"id": "version-1", "clause_template_id": "template-1", "status": "draft"}
        if "SELECT t.is_folder" in query:
            return self.requirements
        raise AssertionError(f"Unexpected query: {query}")

    def execute(self, query, params=None):
        raise AssertionError("Approval writes must not run when requirements are missing")


def test_approval_requires_source_and_separate_client_education(monkeypatch):
    requirements = {
        "is_folder": False,
        "has_clause_text": True,
        "has_internal_explanation": True,
        "has_client_explanation": False,
        "has_source_link": False,
    }
    monkeypatch.setattr(legal_library, "EWDbWriter", lambda _schema: _ApprovalDb(requirements))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(legal_library.approve_clause_version(
            "version-1",
            legal_library.ReviewDecisionBody(reviewer_name="Reviewing Lawyer"),
            _token="dashboard-token",
        ))

    assert exc.value.status_code == 422
    assert "client education" in exc.value.detail
    assert "source page link" in exc.value.detail


class _ImmutableVersionDb:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def fetchone(self, query, params=None):
        return {"id": "approved-1", "status": "approved"}


def test_approved_clause_version_cannot_be_edited(monkeypatch):
    monkeypatch.setattr(legal_library, "EWDbWriter", lambda _schema: _ImmutableVersionDb())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(legal_library.update_clause_version(
            "approved-1",
            legal_library.ClauseVersionBody(clause_text="Changed"),
            _token="dashboard-token",
        ))

    assert exc.value.status_code == 409
