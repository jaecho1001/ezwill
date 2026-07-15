"""Dashboard authentication security regression tests."""

import os
import sys

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import auth


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(auth.router)

    @app.get("/protected")
    def protected(_token: str = Depends(auth.verify_dashboard_token)):
        return {"ok": True}

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


def test_login_sets_hardened_cookies_without_exposing_token(monkeypatch):
    monkeypatch.setattr(auth, "_configured_password", lambda: "plain:correct-password")
    monkeypatch.setenv("AUTH_SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "true")
    auth._login_attempts.clear()
    auth._revoked_tokens.clear()

    response = _client().post("/api/auth/login", json={"password": "correct-password"})

    assert response.status_code == 200
    assert response.json() == {"expires_in": auth.SESSION_SECONDS}
    cookies = response.headers.get_list("set-cookie")
    session_cookie = next(cookie for cookie in cookies if cookie.startswith("ew_session="))
    flag_cookie = next(cookie for cookie in cookies if cookie.startswith("ew_authed="))
    assert "HttpOnly" in session_cookie
    assert "Secure" in session_cookie
    assert "SameSite=lax" in session_cookie
    assert "HttpOnly" not in flag_cookie
    assert "Secure" in flag_cookie
    assert "SameSite=lax" in flag_cookie


def test_cookie_auth_bearer_fallback_and_logout_revocation(monkeypatch):
    monkeypatch.setattr(auth, "_configured_password", lambda: "plain:correct-password")
    monkeypatch.setenv("AUTH_SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    auth._login_attempts.clear()
    auth._revoked_tokens.clear()
    client = _client()

    login_response = client.post(
        "/api/auth/login", json={"password": "correct-password"}
    )
    token = client.cookies.get(auth.SESSION_COOKIE)
    assert login_response.status_code == 200
    assert token
    assert client.get("/protected").status_code == 200

    bearer_client = _client()
    headers = {"Authorization": f"Bearer {token}"}
    assert bearer_client.get("/protected", headers=headers).status_code == 200

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert auth.SESSION_COOKIE not in client.cookies
    assert auth.AUTHED_FLAG_COOKIE not in client.cookies
    assert bearer_client.get("/protected", headers=headers).status_code == 401
