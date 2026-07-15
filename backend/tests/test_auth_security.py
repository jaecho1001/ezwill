"""Dashboard authentication security regression tests."""

import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import auth


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(auth.router)
    return TestClient(app)


def test_login_fails_closed_without_configured_password(monkeypatch):
    monkeypatch.delenv("DASHBOARD_PASSWORD", raising=False)
    monkeypatch.setattr(auth, "_configured_password", lambda: None)
    auth._login_attempts.clear()
    response = _client().post("/api/auth/login", json={"password": "vaturi2026"})
    assert response.status_code == 503


def test_signed_session_survives_in_memory_store_reset(monkeypatch):
    monkeypatch.setenv("AUTH_SESSION_SECRET", "test-session-secret")
    token = auth._issue_session()
    auth._active_tokens.clear()
    assert auth._is_active_dashboard_token(token)


def test_login_rate_limit(monkeypatch):
    monkeypatch.setattr(auth, "_configured_password", lambda: "plain:correct-password")
    auth._login_attempts.clear()
    client = _client()
    for _ in range(auth.LOGIN_MAX_ATTEMPTS):
        assert client.post("/api/auth/login", json={"password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "wrong"}).status_code == 429
