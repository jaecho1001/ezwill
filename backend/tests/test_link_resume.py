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


class LegacyFakeDb(FakeDb):
    """A draft with legacy answers and NO vault."""

    def resolve_link(self, token: str):
        if token != "legacy":
            return None
        return {
            "draft_id": "draft-legacy",
            "client_name": "Old Wizard",
            "language": "en",
            "draft_status": "in_progress",
            "current_step": 3,
            "completed_steps": [1, 2],
            "vault": None,
            "revision": 0,
        }


def test_resolve_backfills_vault_from_legacy_answers(monkeypatch):
    # Issue #78: a client mid-way through the legacy wizard must open the
    # unified intake populated, not blank.
    monkeypatch.setattr(links_route, "EWDbWriter", LegacyFakeDb)
    monkeypatch.setattr(links_route, "get_full_draft", lambda draft_id, schema: {
        "id": draft_id,
        "about_you": {"legalFirstName": "Old", "legalLastName": "Wizard"},
        "your_estate": {
            "beneficiaries": [
                {"id": "b1", "firstName": "Grace", "lastName": "Kim", "percentage": 100},
            ],
            "residueDistribution": "custom",
        },
        "people": [],
        "assets": [],
    })
    links_route._resolve_hits.clear()
    app = FastAPI()
    app.include_router(links_route.router, prefix="/api/links")
    client = TestClient(app)

    body = client.get("/api/links/legacy/resolve").json()
    assert body["vault"]["testator"]["fullName"] == "Old Wizard"
    assert body["vault"]["beneficiaries"][0]["sharePercent"] == 100
    assert body["vault"]["residueDistribution"] == "custom"


def test_resolve_leaves_vault_none_for_truly_empty_drafts(monkeypatch):
    monkeypatch.setattr(links_route, "EWDbWriter", LegacyFakeDb)
    monkeypatch.setattr(links_route, "get_full_draft", lambda draft_id, schema: {
        "id": draft_id, "about_you": None, "people": [], "assets": [],
    })
    links_route._resolve_hits.clear()
    app = FastAPI()
    app.include_router(links_route.router, prefix="/api/links")
    client = TestClient(app)

    assert client.get("/api/links/legacy/resolve").json()["vault"] is None


def test_create_link_reports_logged_only_in_stdout_mode(monkeypatch):
    # Issue #88: stdout mode logs and discards the message; the lawyer must
    # see that, not unqualified success.
    monkeypatch.setattr(links_route, "EWDbWriter", FakeDb)
    monkeypatch.setattr(links_route, "notification_mode", lambda: "stdout")

    async def fake_send(**kwargs):
        return {"email_sent": True, "sms_sent": False}

    monkeypatch.setattr(links_route, "send_magic_link_to_client", fake_send)
    monkeypatch.setattr(
        FakeDb, "create_draft",
        lambda self, **kw: {"id": "draft-a"}, raising=False,
    )
    monkeypatch.setattr(
        FakeDb, "create_link",
        lambda self, **kw: {"token": "tok", "expires_at": "2026-08-27"},
        raising=False,
    )
    from routes.auth import verify_dashboard_token
    app = FastAPI()
    app.include_router(links_route.router, prefix="/api/links")
    app.dependency_overrides[verify_dashboard_token] = lambda: "t"
    client = TestClient(app)

    res = client.post("/api/links/create", json={
        "client_first_name": "Jane", "client_last_name": "Doe",
        "client_email": "jane@example.com", "language": "en",
        "send_email": True, "send_sms": False,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["email_delivery"] == "logged_only"
    assert body["sms_delivery"] == "not_requested"


def test_create_link_reports_failed_when_provider_raises(monkeypatch):
    monkeypatch.setattr(links_route, "EWDbWriter", FakeDb)
    monkeypatch.setattr(links_route, "notification_mode", lambda: "smtp")

    async def exploding_send(**kwargs):
        raise RuntimeError("SMTP down")

    monkeypatch.setattr(links_route, "send_magic_link_to_client", exploding_send)
    monkeypatch.setattr(
        FakeDb, "create_draft",
        lambda self, **kw: {"id": "draft-a"}, raising=False,
    )
    monkeypatch.setattr(
        FakeDb, "create_link",
        lambda self, **kw: {"token": "tok", "expires_at": "2026-08-27"},
        raising=False,
    )
    from routes.auth import verify_dashboard_token
    app = FastAPI()
    app.include_router(links_route.router, prefix="/api/links")
    app.dependency_overrides[verify_dashboard_token] = lambda: "t"
    client = TestClient(app)

    res = client.post("/api/links/create", json={
        "client_first_name": "Jane", "client_last_name": "Doe",
        "client_email": "jane@example.com", "language": "en",
        "send_email": True, "send_sms": False,
    })
    # Link creation still succeeds — the lawyer needs the URL to copy —
    # but the delivery status must say the client was NOT reached.
    assert res.status_code == 200
    assert res.json()["email_delivery"] == "failed"
