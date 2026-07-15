"""Simple password-based auth for the EZWill lawyer dashboard."""

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel
from dataclasses import dataclass
from typing import Optional
import os
import secrets
import time
import base64
import hashlib
import hmac
import json

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Legacy in-memory tokens remain recognized during rolling upgrades. Newly
# issued sessions are signed and therefore work across workers and restarts.
_active_tokens: dict = {}
_login_attempts: dict[str, list[float]] = {}
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 5
SESSION_SECONDS = 24 * 60 * 60


@dataclass(frozen=True)
class AuthContext:
    kind: str  # "dashboard" | "magic_link" | "agent"
    token: str
    draft_id: str | None = None


class LoginRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not isinstance(authorization, str) or not authorization.startswith("Bearer "):
        return None
    return authorization[7:]


def _is_active_dashboard_token(token: str) -> bool:
    expiry = _active_tokens.get(token)
    if expiry and time.time() <= expiry:
        return True
    if expiry:
        _active_tokens.pop(token, None)
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(_session_secret(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return False
        padding = "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(encoded + padding))
        return payload.get("purpose") == "dashboard" and time.time() < payload["exp"]
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return False


def _configured_password() -> str | None:
    """Return the configured password, preferring a persisted salted hash."""
    from services.db import EWDbWriter

    try:
        with EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
            auth_settings = (db.get_firm_settings() or {}).get("_auth") or {}
            if auth_settings.get("password_hash"):
                return auth_settings["password_hash"]
    except Exception:
        pass
    password = os.getenv("DASHBOARD_PASSWORD")
    return f"plain:{password}" if password else None


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
    return "pbkdf2_sha256$600000$%s$%s" % (salt.hex(), digest.hex())


def _verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    if stored.startswith("plain:"):
        return secrets.compare_digest(password, stored[6:])
    try:
        algorithm, iterations, salt, expected = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
        ).hex()
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _session_secret() -> bytes:
    secret = os.getenv("AUTH_SESSION_SECRET")
    if not secret:
        # Fail closed — never fall back to the (guessable/known-default) dashboard
        # password, which would let anyone knowing it forge valid admin sessions.
        raise ValueError(
            "AUTH_SESSION_SECRET is not configured — set a strong random secret "
            "(e.g. `openssl rand -hex 32`)"
        )
    return secret.encode()


def _issue_session() -> str:
    payload = {"purpose": "dashboard", "exp": int(time.time()) + SESSION_SECONDS,
               "nonce": secrets.token_urlsafe(12)}
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    signature = hmac.new(_session_secret(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def _check_rate_limit(client: str) -> None:
    now = time.time()
    attempts = [t for t in _login_attempts.get(client, []) if now - t < LOGIN_WINDOW_SECONDS]
    _login_attempts[client] = attempts
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many login attempts; try again later")


def _record_failed_login(client: str) -> None:
    _login_attempts.setdefault(client, []).append(time.time())


def verify_dashboard_token(authorization: str = Header(None)) -> str:
    """FastAPI dependency that validates Bearer token on dashboard routes."""
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    if not _is_active_dashboard_token(token):
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    return token


def verify_client_or_dashboard_access(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_magic_token: Optional[str] = Header(None),
) -> AuthContext:
    """Validate dashboard bearer token or client magic-link token."""
    token = _extract_bearer_token(authorization)
    if token:
        if _is_active_dashboard_token(token):
            return AuthContext(kind="dashboard", token=token)

    # Try magic link token (X-Magic-Token header or query param)
    magic_token = x_magic_token or request.query_params.get("t")
    if magic_token:
        from services.db import EWDbWriter
        schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
        try:
            with EWDbWriter(schema) as db:
                link = db.resolve_link(magic_token)
                if link:
                    return AuthContext(
                        kind="magic_link",
                        token=magic_token,
                        draft_id=str(link["draft_id"]),
                    )
        except Exception:
            pass

    raise HTTPException(status_code=401, detail="Missing or invalid authorization")


def verify_client_or_dashboard_draft_access(
    draft_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
    x_magic_token: Optional[str] = Header(None),
) -> AuthContext:
    """Validate access to the specific draft in the path.

    Dashboard bearer tokens can access any draft. Client magic-link tokens can
    only access the draft they resolve to; otherwise a valid token for client A
    could be replayed against client B's draft UUID.
    """
    ctx = verify_client_or_dashboard_access(request, authorization, x_magic_token)
    return assert_auth_context_can_access_draft(ctx, draft_id)


def assert_auth_context_can_access_draft(ctx: AuthContext, draft_id: str) -> AuthContext:
    """Ensure a resolved auth context grants access to a specific draft."""
    if ctx.kind == "magic_link" and ctx.draft_id != str(draft_id):
        raise HTTPException(status_code=403, detail="Token does not grant access to this draft")
    return ctx


def verify_agent_or_dashboard_token(
    authorization: Optional[str] = Header(None),
    x_agent_token: Optional[str] = Header(None),
) -> AuthContext:
    """Validate dashboard bearer auth or a server-to-server agent token.

    AGENT_API_TOKEN is optional so local dashboard-only development keeps
    working. When set, callers may provide it as either Bearer or X-Agent-Token.
    """
    bearer_token = _extract_bearer_token(authorization)
    if bearer_token and _is_active_dashboard_token(bearer_token):
        return AuthContext(kind="dashboard", token=bearer_token)

    configured_agent_token = os.getenv("AGENT_API_TOKEN", "")
    provided_agent_token = x_agent_token or bearer_token
    if (
        configured_agent_token
        and provided_agent_token
        and secrets.compare_digest(provided_agent_token, configured_agent_token)
    ):
        return AuthContext(kind="agent", token=provided_agent_token)

    raise HTTPException(status_code=401, detail="Missing or invalid authorization")


@router.post("/login")
async def login(req: LoginRequest, request: Request):
    client = request.client.host if request.client else "unknown"
    _check_rate_limit(client)
    configured = _configured_password()
    if not configured:
        raise HTTPException(503, "Dashboard authentication is not configured")
    if not _verify_password(req.password, configured):
        _record_failed_login(client)
        raise HTTPException(status_code=401, detail="Invalid password")
    _login_attempts.pop(client, None)
    try:
        token = _issue_session()
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"token": token, "expires_in": SESSION_SECONDS}


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    request: Request,
    _token: str = Depends(verify_dashboard_token),
):
    # Require a valid dashboard session AND throttle by client so this endpoint
    # can't be used as an unauthenticated, unlimited password-verification oracle
    # that bypasses the login rate limiter.
    client = request.client.host if request.client else "unknown"
    _check_rate_limit(client)
    configured = _configured_password()
    if not _verify_password(req.current_password, configured):
        _record_failed_login(client)
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(req.new_password) < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters")
    _login_attempts.pop(client, None)
    from services.db import EWDbWriter
    with EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
        settings = db.get_firm_settings() or {}
        settings["_auth"] = {"password_hash": _hash_password(req.new_password)}
        db.upsert_firm_settings(settings)
    return {"message": "Password changed successfully"}
