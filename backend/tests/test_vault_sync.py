"""Vault sync + summary-flow submit tests.

The AI-intake summary flow keeps the client's answers in a local WillVault.
For the lawyer to ever see them, the client must be able to PUT the vault
(and their contact email) onto their own draft using the draft-bound magic
token — and nobody else's. The firm notification must also name the client
from the vault when the draft row has no first/last name (vault-only flow).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import services.db as db_mod
from routes import drafts as drafts_route
from services import notification_service


VAULT = {
    "testator": {"fullName": "HYUN JUNG KIM", "address": "123 Main St, Vaughan"},
    "goals": {"hasDualWill": True},
}


class FakeDb:
    updated: dict = {}
    status: str = "opened"

    def __init__(self, schema: str):
        self.schema = schema

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return None

    def resolve_link(self, token: str):
        if token == "token-a":
            return {"draft_id": "draft-a", "client_name": "A", "language": "en"}
        if token == "token-b":
            return {"draft_id": "draft-b", "client_name": "B", "language": "en"}
        return None

    def get_draft(self, draft_id: str):
        return {"id": draft_id, "status": type(self).status}

    def update_draft(self, draft_id: str, updates: dict):
        type(self).updated = {"draft_id": draft_id, **updates}
        return {"id": draft_id, **updates}


@pytest.fixture
def client(monkeypatch):
    # The auth dependency resolves tokens through services.db.EWDbWriter;
    # the route body uses its own module-level import — patch both.
    monkeypatch.setattr(db_mod, "EWDbWriter", FakeDb)
    monkeypatch.setattr(drafts_route, "EWDbWriter", FakeDb)
    FakeDb.updated = {}
    FakeDb.status = "opened"

    app = FastAPI()
    app.include_router(drafts_route.router, prefix="/api/drafts")
    return TestClient(app)


def test_client_can_put_vault_and_email_onto_own_draft(client):
    res = client.put(
        "/api/drafts/draft-a",
        headers={"X-Magic-Token": "token-a"},
        json={"vault": VAULT, "client_email": "hyunjung@example.com"},
    )
    assert res.status_code == 200
    assert json.loads(FakeDb.updated["vault"]) == VAULT
    assert FakeDb.updated["client_email"] == "hyunjung@example.com"


def test_client_cannot_write_another_drafts_vault(client):
    # token-b resolves to draft-b; writing draft-a must 403 and write nothing.
    res = client.put(
        "/api/drafts/draft-a",
        headers={"X-Magic-Token": "token-b"},
        json={"vault": VAULT},
    )
    assert res.status_code == 403
    assert FakeDb.updated == {}


def test_put_without_vault_leaves_vault_untouched(client):
    res = client.put(
        "/api/drafts/draft-a",
        headers={"X-Magic-Token": "token-a"},
        json={"language": "ko"},
    )
    assert res.status_code == 200
    assert "vault" not in FakeDb.updated
    assert "client_email" not in FakeDb.updated


def test_client_cannot_change_vault_after_submission(client):
    FakeDb.status = "submitted"
    res = client.put(
        "/api/drafts/draft-a",
        headers={"X-Magic-Token": "token-a"},
        json={"vault": VAULT},
    )
    assert res.status_code == 409
    assert FakeDb.updated == {}


# ── firm notification names the client from the vault ───────────────────────

def _captured_firm_email(monkeypatch, draft):
    captured = {}

    async def fake_send(subject, body):
        captured["subject"] = subject
        captured["body"] = body
        return True

    monkeypatch.setattr(notification_service, "_send_firm_email", fake_send)
    asyncio.run(notification_service.notify_lawyer_submission(draft, []))
    return captured


def test_notification_falls_back_to_vault_name(monkeypatch):
    draft = {
        "id": "draft-1",
        "client_first_name": "",
        "client_last_name": "",
        "vault": VAULT,
        "client_email": "hyunjung@example.com",
    }
    captured = _captured_firm_email(monkeypatch, draft)
    assert "HYUN JUNG KIM" in captured["subject"]


def test_notification_without_any_name_is_explicit_not_blank(monkeypatch):
    draft = {"id": "draft-1", "client_first_name": "", "client_last_name": ""}
    captured = _captured_firm_email(monkeypatch, draft)
    assert "Unnamed client" in captured["subject"]


def test_notification_survives_client_malformed_vault(monkeypatch):
    # The vault is client-controlled JSONB (Pydantic validates only the top
    # level). A scalar where an object belongs must not crash the fallback —
    # a crash here is swallowed by the submit route's try/except and silently
    # drops both the lawyer email and GHL tracking.
    for bad_vault in (
        {"testator": "John Smith"},          # scalar instead of object
        {"testator": {"fullName": {"x": 1}}},  # object instead of string
        {"testator": None},
        "not-even-a-dict",
    ):
        draft = {"id": "draft-1", "client_first_name": "", "client_last_name": "",
                 "vault": bad_vault}
        captured = _captured_firm_email(monkeypatch, draft)
        assert "Unnamed client" in captured["subject"]


def test_notification_prefers_draft_row_name_over_vault(monkeypatch):
    draft = {
        "id": "draft-1",
        "client_first_name": "Moonyoung",
        "client_last_name": "Lee",
        "vault": VAULT,
    }
    captured = _captured_firm_email(monkeypatch, draft)
    assert "Moonyoung Lee" in captured["subject"]
    assert "HYUN JUNG KIM" not in captured["subject"]
