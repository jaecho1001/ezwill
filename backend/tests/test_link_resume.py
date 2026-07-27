"""Magic-link resolution returns the server vault needed for cross-device resume."""

from __future__ import annotations

import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import links as links_route
from services import link_service


class FakeDb:
    def __init__(self, schema: str):
        self.schema = schema

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return None

    def resolve_link(self, token: str):
        if token != "valid":
            return None
        return {
            "draft_id": "draft-a",
            "client_name": "Jane Doe",
            "language": "ko",
            "draft_status": "in_progress",
            "current_step": 4,
            "completed_steps": [1, 2, 3],
            "vault": {"schemaVersion": 2, "testator": {"fullName": "Jane Doe"}},
            "revision": 7,
        }

    def mark_link_opened(self, token: str):
        return True


def test_resolve_link_returns_vault_but_never_contact_fields(monkeypatch):
    monkeypatch.setattr(links_route, "EWDbWriter", FakeDb)
    links_route._resolve_hits.clear()
    app = FastAPI()
    app.include_router(links_route.router, prefix="/api/links")
    client = TestClient(app)

    response = client.get("/api/links/valid/resolve")

    assert response.status_code == 200
    body = response.json()
    assert body["vault"]["schemaVersion"] == 2
    assert body["completed_steps"] == [1, 2, 3]
    assert response.headers["cache-control"] == "no-store"
    # Pin the EXACT key set: this endpoint answers to a bare token, so any
    # field added here is handed to whoever holds (or leaks) the link.
    # Growing this set must be a deliberate, reviewed decision (issue #77).
    assert body["revision"] == 7
    assert set(body.keys()) == {
        "draft_id", "client_name", "language", "status",
        "current_step", "completed_steps", "vault", "revision",
    }


def test_resolve_link_is_rate_limited(monkeypatch):
    monkeypatch.setattr(links_route, "EWDbWriter", FakeDb)
    monkeypatch.setattr(links_route, "RESOLVE_MAX_PER_WINDOW", 5)
    links_route._resolve_hits.clear()
    app = FastAPI()
    app.include_router(links_route.router, prefix="/api/links")
    client = TestClient(app)

    # A bare token is the only credential, so probing must be throttled.
    for _ in range(5):
        assert client.get("/api/links/nope/resolve").status_code == 404
    assert client.get("/api/links/nope/resolve").status_code == 429
    # The limit must also cover valid tokens (enumeration doesn't announce
    # itself by failing).
    assert client.get("/api/links/valid/resolve").status_code == 429
    links_route._resolve_hits.clear()


def test_questionnaire_url_targets_existing_dynamic_intake_route(monkeypatch):
    monkeypatch.setattr(link_service, "BASE_URL", "https://ezwill.example")

    assert link_service.build_questionnaire_url(
        "draft-a", "token-a", "ko"
    ) == "https://ezwill.example/intake/draft-a?t=token-a&lang=ko"
