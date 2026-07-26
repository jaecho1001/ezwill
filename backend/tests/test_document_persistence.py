"""Document persistence (audit trail) route tests.

Before migration 37 the generate endpoints streamed bytes to the caller and
recorded only a throwaway "memory://<type>" marker — no stored copy existed of
what a client was actually given. These tests pin the new behavior: the exact
delivered bytes are recorded via record_document_generation, the config row
points at the stored generation, and the audit trail is retrievable (bound to
the correct draft) afterwards.
"""

from __future__ import annotations

import io
import os
import sys
import zipfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import documents as documents_route
from routes.auth import verify_dashboard_token


CLAUSE_COMPLETE = [{
    "clause_id": "revocation",
    "included": True,
    "templateText": "I, {{testatorFullName}}, revoke all prior wills.",
    "sortOrder": 1,
    "title": "Revocation",
}]

CLAUSE_MISSING = [{
    "clause_id": "executors",
    "included": True,
    "templateText": "I appoint {{primaryExecutorFullName}}.",
    "sortOrder": 1,
    "title": "Executors",
}]

DRAFT = {
    "id": "draft-1",
    "client_first_name": "Hyun Jung",
    "client_last_name": "Kim",
    "province": "ON",
    "people": [],
}

GENERATION_ROWS = [{
    "id": "gen-1",
    "draft_id": "draft-1",
    "document_type": "single_will",
    "format": "docx",
    "storage_path": "db://ew_document_generations/gen-1",
    "content_sha256": "abc123",
    "byte_size": 4,
    "generation_params": {"unresolved": []},
    "generated_by": "dashboard",
    "created_at": "2026-07-19 12:00:00",
}]


class FakeDb:
    recorded: list = []
    config_updates: list = []
    clause_selections: list = []
    all_selections: dict = {}
    generation_content: dict = None  # row returned by get_document_generation_content

    def __init__(self, schema: str):
        self.schema = schema

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return None

    def get_clause_selections(self, draft_id, document_type):
        return list(type(self).clause_selections)

    def get_all_clause_selections(self, draft_id):
        return dict(type(self).all_selections)

    def get_document_configs(self, draft_id):
        return []

    def get_firm_settings(self):
        return {}

    def record_document_generation(self, draft_id, document_type, file_format,
                                   content, generated_by="dashboard", params=None):
        gen_id = f"gen-{len(type(self).recorded) + 1}"
        type(self).recorded.append({
            "id": gen_id,
            "draft_id": draft_id,
            "document_type": document_type,
            "format": file_format,
            "content": content,
            "generated_by": generated_by,
            "params": params or {},
        })
        return {
            "id": gen_id,
            "created_at": "now",
            "storage_path": f"db://ew_document_generations/{gen_id}",
            "content_sha256": "x",
            "byte_size": len(content),
        }

    def update_document_generated(self, draft_id, document_type, file_path):
        type(self).config_updates.append((draft_id, document_type, file_path))
        return True

    def get_document_generations(self, draft_id):
        return list(GENERATION_ROWS)

    def get_document_generation_content(self, generation_id):
        return type(self).generation_content


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(documents_route, "EWDbWriter", FakeDb)
    monkeypatch.setattr(documents_route, "get_full_draft", lambda draft_id, schema: dict(DRAFT))
    FakeDb.recorded = []
    FakeDb.config_updates = []
    FakeDb.generation_content = None

    app = FastAPI()
    app.include_router(documents_route.router, prefix="/api/documents")
    app.dependency_overrides[verify_dashboard_token] = lambda: "test-token"
    return TestClient(app)


# ── delivery records the exact bytes ─────────────────────────────────────────

def test_generate_persists_exact_delivered_bytes(client):
    FakeDb.clause_selections = CLAUSE_COMPLETE
    res = client.post(
        "/api/documents/draft-1/generate",
        json={"document_type": "single_will", "format": "docx"},
    )
    assert res.status_code == 200
    assert len(FakeDb.recorded) == 1
    rec = FakeDb.recorded[0]
    assert rec["format"] == "docx"
    assert rec["content"] == res.content  # byte-for-byte what the caller got
    # Config row points at the stored generation, not a memory:// marker.
    assert FakeDb.config_updates == [
        ("draft-1", "single_will", "db://ew_document_generations/gen-1")
    ]


def test_blocked_generation_persists_nothing(client):
    FakeDb.clause_selections = CLAUSE_MISSING
    res = client.post(
        "/api/documents/draft-1/generate",
        json={"document_type": "single_will", "format": "docx"},
    )
    assert res.status_code == 422
    assert FakeDb.recorded == []
    assert FakeDb.config_updates == []


def test_generate_pdf_persists_pdf_bytes(client, monkeypatch):
    FakeDb.clause_selections = CLAUSE_COMPLETE
    monkeypatch.setattr(documents_route, "convert_to_pdf", lambda b: b"%PDF-fake")
    res = client.post(
        "/api/documents/draft-1/generate",
        json={"document_type": "single_will", "format": "pdf"},
    )
    assert res.status_code == 200
    assert res.content == b"%PDF-fake"
    rec = FakeDb.recorded[0]
    assert rec["format"] == "pdf"
    assert rec["content"] == b"%PDF-fake"


def test_generate_all_persists_every_document(client):
    FakeDb.all_selections = {
        "single_will": CLAUSE_COMPLETE,
        "poa_property": CLAUSE_COMPLETE,
    }
    res = client.post("/api/documents/draft-1/generate-all")
    assert res.status_code == 200
    assert {r["document_type"] for r in FakeDb.recorded} == {"single_will", "poa_property"}
    assert all(r["params"].get("batch") for r in FakeDb.recorded)
    # ZIP contents match the persisted bytes.
    with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
        zipped = {name: zf.read(name) for name in zf.namelist()}
    assert set(zipped.values()) == {r["content"] for r in FakeDb.recorded}


def test_override_delivery_records_unresolved_in_params(client):
    FakeDb.clause_selections = CLAUSE_MISSING
    res = client.post(
        "/api/documents/draft-1/generate",
        json={"document_type": "single_will", "format": "docx", "allow_incomplete": True},
    )
    assert res.status_code == 200
    rec = FakeDb.recorded[0]
    # The audit row must show this was a deliberate incomplete delivery.
    assert rec["params"]["allow_incomplete"] is True
    assert "primaryExecutorFullName" in rec["params"]["unresolved"]


# ── audit trail retrieval ────────────────────────────────────────────────────

def test_list_generations_returns_metadata_without_bytes(client):
    res = client.get("/api/documents/draft-1/generations")
    assert res.status_code == 200
    gens = res.json()["generations"]
    assert len(gens) == 1
    assert gens[0]["content_sha256"] == "abc123"
    assert "content" not in gens[0]


GEN_UUID = "11111111-1111-1111-1111-111111111111"
GEN_UUID_2 = "22222222-2222-2222-2222-222222222222"


def test_download_generation_streams_stored_bytes(client):
    FakeDb.generation_content = {
        "id": GEN_UUID, "draft_id": "draft-1", "document_type": "single_will",
        "format": "docx", "content": b"STORED", "content_sha256": "x",
        "byte_size": 6, "created_at": "now",
    }
    res = client.get(f"/api/documents/draft-1/generations/{GEN_UUID}/download")
    assert res.status_code == 200
    assert res.content == b"STORED"


def test_download_generation_is_draft_bound(client):
    # A generation belonging to another draft must 404 through this URL —
    # otherwise any draft id could read any client's stored documents.
    FakeDb.generation_content = {
        "id": GEN_UUID_2, "draft_id": "OTHER-draft", "document_type": "single_will",
        "format": "docx", "content": b"SECRET", "content_sha256": "x",
        "byte_size": 6, "created_at": "now",
    }
    res = client.get(f"/api/documents/draft-1/generations/{GEN_UUID_2}/download")
    assert res.status_code == 404
    assert b"SECRET" not in res.content


def test_download_malformed_generation_id_404s_without_touching_db(client, monkeypatch):
    # A non-UUID id must be rejected before the query — Postgres would raise
    # on the uuid cast and surface as a 500 instead of this route's 404.
    def _explode(self, generation_id):
        raise AssertionError("query must not run for malformed ids")

    monkeypatch.setattr(FakeDb, "get_document_generation_content", _explode)
    res = client.get("/api/documents/draft-1/generations/not-a-uuid/download")
    assert res.status_code == 404


def test_download_pre_migration_row_404s_cleanly(client):
    FakeDb.generation_content = {
        "id": GEN_UUID, "draft_id": "draft-1", "document_type": "single_will",
        "format": "docx", "content": None, "content_sha256": None,
        "byte_size": None, "created_at": "now",
    }
    res = client.get(f"/api/documents/draft-1/generations/{GEN_UUID}/download")
    assert res.status_code == 404
