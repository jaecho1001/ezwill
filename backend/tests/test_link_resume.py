"""Magic-link resolution returns the server vault needed for cross-device resume."""

from __future__ import annotations

import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import links as links_route


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
            "client_email": "jane@example.com",
            "client_phone": "416-555-0100",
        }

    def mark_link_opened(self, token: str):
        return True


def test_resolve_link_returns_saved_vault_and_contact(monkeypatch):
    monkeypatch.setattr(links_route, "EWDbWriter", FakeDb)
    app = FastAPI()
    app.include_router(links_route.router, prefix="/api/links")
    client = TestClient(app)

    response = client.get("/api/links/valid/resolve")

    assert response.status_code == 200
    assert response.json()["vault"]["schemaVersion"] == 2
    assert response.json()["client_email"] == "jane@example.com"
    assert response.json()["completed_steps"] == [1, 2, 3]
    assert response.headers["cache-control"] == "no-store"
