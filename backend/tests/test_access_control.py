"""Access-control regression tests for draft-bound client/review tokens."""

from __future__ import annotations

import os
import sys

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import agents, ai_intake, auth, documents, drafts, review


class FakeDb:
    def __init__(self, schema: str):
        self.schema = schema

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return None

    def resolve_link(self, token: str):
        if token == "token-a":
            return {"draft_id": "draft-a", "client_name": "Client A", "language": "en"}
        if token == "token-b":
            return {"draft_id": "draft-b", "client_name": "Client B", "language": "en"}
        return None

    def resolve_review_link(self, token: str):
        return self.resolve_link(token)

    def get_draft(self, draft_id: str):
        # Returning None lets a route that PASSED auth reach its own 404 branch,
        # which distinguishes "auth accepted" (404) from "auth rejected" (403).
        return None


def _request(query_string: bytes = b"") -> Request:
    return Request({"type": "http", "query_string": query_string, "headers": []})


def test_magic_token_must_match_draft_id(monkeypatch):
    import services.db as db_mod

    monkeypatch.setattr(db_mod, "EWDbWriter", FakeDb)

    ctx = auth.verify_client_or_dashboard_draft_access(
        "draft-a",
        _request(),
        authorization=None,
        x_magic_token="token-a",
    )
    assert ctx.kind == "magic_link"
    assert ctx.draft_id == "draft-a"

    with pytest.raises(HTTPException) as exc:
        auth.verify_client_or_dashboard_draft_access(
            "draft-b",
            _request(),
            authorization=None,
            x_magic_token="token-a",
        )
    assert exc.value.status_code == 403


def test_dashboard_token_can_access_any_draft():
    auth._active_tokens["dash-token"] = 9999999999
    try:
        ctx = auth.verify_client_or_dashboard_draft_access(
            "any-draft",
            _request(),
            authorization="Bearer dash-token",
            x_magic_token=None,
        )
        assert ctx.kind == "dashboard"
    finally:
        auth._active_tokens.pop("dash-token", None)


def test_auth_context_helper_blocks_cross_draft_magic_token():
    ctx = auth.AuthContext(kind="magic_link", token="token-a", draft_id="draft-a")

    with pytest.raises(HTTPException) as exc:
        auth.assert_auth_context_can_access_draft(ctx, "draft-b")

    assert exc.value.status_code == 403


def test_agent_token_can_authorize_server_to_server_route(monkeypatch):
    monkeypatch.setenv("AGENT_API_TOKEN", "agent-secret")

    ctx = auth.verify_agent_or_dashboard_token(
        authorization=None,
        x_agent_token="agent-secret",
    )

    assert ctx.kind == "agent"


def test_agent_token_dependency_rejects_missing_auth(monkeypatch):
    monkeypatch.delenv("AGENT_API_TOKEN", raising=False)

    with pytest.raises(HTTPException) as exc:
        auth.verify_agent_or_dashboard_token(
            authorization=None,
            x_agent_token=None,
        )

    assert exc.value.status_code == 401


def test_agents_invoke_route_requires_auth():
    app = FastAPI()
    app.include_router(agents.router, prefix="/agents")
    client = TestClient(app)

    res = client.post(
        "/agents/will/invoke",
        json={"capability": "get_draft_status", "payload": {"draft_id": "draft-a"}},
    )

    assert res.status_code == 401


def test_agents_invoke_route_accepts_agent_token(monkeypatch):
    monkeypatch.setenv("AGENT_API_TOKEN", "agent-secret")
    app = FastAPI()
    app.include_router(agents.router, prefix="/agents")
    client = TestClient(app)

    res = client.post(
        "/agents/will/invoke",
        headers={"X-Agent-Token": "agent-secret"},
        json={"capability": "unknown", "payload": {}},
    )

    assert res.status_code == 400
    assert res.json()["detail"] == "Unknown capability: unknown"


def test_intake_chat_route_rejects_cross_draft_magic_token(monkeypatch):
    import services.db as db_mod

    monkeypatch.setattr(db_mod, "EWDbWriter", FakeDb)
    app = FastAPI()
    app.include_router(ai_intake.router, prefix="/api/ai/intake")
    client = TestClient(app)

    res = client.post(
        "/api/ai/intake/chat",
        headers={"X-Magic-Token": "token-a"},
        json={
            "draft_id": "draft-b",
            "messages": [{"role": "user", "content": "hello"}],
            "vault": {},
        },
    )

    assert res.status_code == 403


def test_review_token_must_match_draft_id(monkeypatch):
    monkeypatch.setattr(review, "EWDbWriter", FakeDb)

    link = review._validate_review_token_for_draft("token-a", "draft-a")
    assert link["draft_id"] == "draft-a"

    with pytest.raises(HTTPException) as exc:
        review._validate_review_token_for_draft("token-a", "draft-b")
    assert exc.value.status_code == 403


def test_review_preview_placeholder_resolves_from_token(monkeypatch):
    monkeypatch.setattr(review, "EWDbWriter", FakeDb)

    link = review._validate_review_token_for_draft("token-a", "__from_token__")
    assert link["draft_id"] == "draft-a"


# ── Route-level regression guards (H2) ────────────────────────────────────────
# The tests above exercise the auth HELPERS. These build the actual wired
# routers via TestClient so that reverting a route back to an unbound token
# check (the pre-#47 IDOR bug) fails the suite instead of passing silently.


def _drafts_client(monkeypatch) -> TestClient:
    import services.db as db_mod

    monkeypatch.setattr(db_mod, "EWDbWriter", FakeDb)  # auth resolves the token
    monkeypatch.setattr(drafts, "EWDbWriter", FakeDb)  # route body, if reached
    app = FastAPI()
    app.include_router(drafts.router, prefix="/api/drafts")
    return TestClient(app)


def test_drafts_update_route_rejects_cross_draft_magic_token(monkeypatch):
    client = _drafts_client(monkeypatch)

    res = client.put(
        "/api/drafts/draft-b",
        headers={"X-Magic-Token": "token-a"},
        json={"current_step": 1},
    )

    assert res.status_code == 403


def test_drafts_update_route_accepts_matching_magic_token(monkeypatch):
    client = _drafts_client(monkeypatch)

    # token-a resolves to draft-a, matching the path, so auth ACCEPTS and the
    # route reaches its own 404 (FakeDb.get_draft returns None). A 404 — not a
    # 403 — proves the matching-token accept path is wired at the route level.
    res = client.put(
        "/api/drafts/draft-a",
        headers={"X-Magic-Token": "token-a"},
        json={"current_step": 1},
    )

    assert res.status_code == 404


def test_drafts_submit_route_rejects_cross_draft_magic_token(monkeypatch):
    client = _drafts_client(monkeypatch)

    res = client.post(
        "/api/drafts/draft-b/submit",
        headers={"X-Magic-Token": "token-a"},
    )

    assert res.status_code == 403


def _review_client(monkeypatch) -> TestClient:
    monkeypatch.setattr(review, "EWDbWriter", FakeDb)
    app = FastAPI()
    app.include_router(review.router, prefix="/api/review")
    return TestClient(app)


def test_review_status_route_rejects_cross_draft_token(monkeypatch):
    client = _review_client(monkeypatch)

    res = client.get("/api/review/draft-b/status", params={"token": "token-a"})

    assert res.status_code == 403


def test_review_preview_route_rejects_cross_draft_token(monkeypatch):
    client = _review_client(monkeypatch)

    res = client.get(
        "/api/review/draft-b/preview/single_will", params={"token": "token-a"}
    )

    assert res.status_code == 403


def test_review_approve_route_rejects_cross_draft_token(monkeypatch):
    client = _review_client(monkeypatch)

    res = client.post(
        "/api/review/draft-b/approve/single_will",
        json={"token": "token-a"},
    )

    assert res.status_code == 403


def test_review_comment_route_rejects_cross_draft_token(monkeypatch):
    client = _review_client(monkeypatch)

    res = client.post(
        "/api/review/draft-b/comment",
        json={
            "token": "token-a",
            "document_type": "single_will",
            "clause_id": "clause-1",
            "comment": "question",
        },
    )

    assert res.status_code == 403


def test_document_preview_route_requires_dashboard_auth():
    # H1: the documents-router preview leaks full will PII; it must reject
    # requests with no dashboard bearer token.
    app = FastAPI()
    app.include_router(documents.router, prefix="/api/documents")
    client = TestClient(app)

    res = client.get("/api/documents/draft-a/preview/single_will")

    assert res.status_code == 401


def test_intake_chat_route_rejects_missing_token(monkeypatch):
    # M2: the intake endpoint must reject fully-unauthenticated calls (401),
    # not only cross-draft ones (403).
    import services.db as db_mod

    monkeypatch.setattr(db_mod, "EWDbWriter", FakeDb)
    app = FastAPI()
    app.include_router(ai_intake.router, prefix="/api/ai/intake")
    client = TestClient(app)

    res = client.post(
        "/api/ai/intake/chat",
        json={
            "draft_id": "draft-a",
            "messages": [{"role": "user", "content": "hello"}],
            "vault": {},
        },
    )

    assert res.status_code == 401
