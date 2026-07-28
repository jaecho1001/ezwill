"""Simple password-based auth for the EZWill lawyer dashboard."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Header, Request, Response
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
from services.client_ip import client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Legacy in-memory tokens remain recognized during rolling upgrades. Newly
# issued sessions are signed and therefore work across workers and restarts.
_active_tokens: dict = {}
_revoked_tokens: dict[str, float] = {}
_login_attempts: dict[str, list[float]] = {}
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 5
SESSION_SECONDS = 24 * 60 * 60

# The dashboard session travels in an HttpOnly cookie so an XSS payload can't
# read or exfiltrate it (unlike a JS-readable cookie or Authorization header
# stored in the SPA). A second, non-sensitive readable flag lets the client-side
# route guard know it is logged in without ever seeing the token itself.
SESSION_COOKIE = "ew_session"
AUTHED_FLAG_COOKIE = "ew_authed"


def _cookie_secure() -> bool:
    """Secure cookies require HTTPS. Prod = true; local http dev sets false."""
    return os.getenv("SESSION_COOKIE_SECURE", "true").strip().lower() != "false"


def _set_session_cookies(response: Response, token: str) -> None:
    secure = _cookie_secure()
    response.set_cookie(
        SESSION_COOKIE, token, max_age=SESSION_SECONDS, httponly=True,
        secure=secure, samesite="lax", path="/",
    )
    response.set_cookie(
        AUTHED_FLAG_COOKIE, "1", max_age=SESSION_SECONDS, httponly=False,
        secure=secure, samesite="lax", path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(AUTHED_FLAG_COOKIE, path="/")


@dataclass(frozen=True)
class AuthContext:
    kind: str  # "dashboard" | "magic_link" | "agent"
    token: str
    draft_id: str | None = None


class LoginRequest(BaseModel):
    password: str
    # Per-lawyer login (#52). Empty/absent = legacy shared-password mode,
    # kept working through the transition (it acts as the bootstrap admin).
    email: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not isinstance(authorization, str) or not authorization.startswith("Bearer "):
        return None
    return authorization[7:]


def _dashboard_token(request: Optional[Request], authorization: Optional[str]) -> Optional[str]:
    """Resolve the dashboard session token.

    Prefer the HttpOnly session cookie (browser dashboard); fall back to the
    Authorization: Bearer header for API clients — tests, the function-test
    sweep, and any server-to-server caller.
    """
    if request is not None:
        cookie_token = request.cookies.get(SESSION_COOKIE)
        if cookie_token:
            return cookie_token
    return _extract_bearer_token(authorization)


def _is_active_dashboard_token(token: str) -> bool:
    revoked_until = _revoked_tokens.get(token)
    if revoked_until:
        if time.time() < revoked_until:
            return False
        _revoked_tokens.pop(token, None)

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


def _revoke_dashboard_token(token: str) -> None:
    """Revoke a session for the lifetime remaining on its token."""
    expiry = _active_tokens.pop(token, None)
    if expiry is None:
        try:
            encoded, _signature = token.split(".", 1)
            padding = "=" * (-len(encoded) % 4)
            payload = json.loads(base64.urlsafe_b64decode(encoded + padding))
            expiry = float(payload["exp"])
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            return
    if expiry > time.time():
        _revoked_tokens[token] = expiry


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


def _issue_session(actor: dict | None = None) -> str:
    payload = {"purpose": "dashboard", "exp": int(time.time()) + SESSION_SECONDS,
               "nonce": secrets.token_urlsafe(12)}
    if actor:
        # WHO this session belongs to (#52): flows into approved_by,
        # asked_by, generated_by. Signed with the session, so it cannot be
        # altered client-side.
        payload["actor"] = {
            "id": str(actor.get("id")) if actor.get("id") else None,
            "name": actor.get("full_name") or actor.get("name"),
            "email": actor.get("email"),
            "role": actor.get("role") or "lawyer",
        }
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


def verify_dashboard_token(request: Request = None, authorization: str = Header(None)) -> str:
    """FastAPI dependency that validates the dashboard session (cookie or Bearer).

    `request` defaults to None so the dependency can also be called directly in
    unit tests; FastAPI injects the real Request on routed calls.
    """
    token = _dashboard_token(request, authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid authorization")
    if not _is_active_dashboard_token(token):
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    return token


def _actor_from_token(token: str) -> dict:
    """Decode the session's actor claim (#52).

    Legacy shared-password sessions carry no actor and act as the bootstrap
    admin named 'dashboard'. Test overrides that return a plain short string
    surface that string as the actor name, which keeps audit assertions
    readable in tests.
    """
    fallback_name = "dashboard"
    try:
        encoded, _sig = token.split(".", 1)
        padding = "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(encoded + padding))
        actor = payload.get("actor")
        if isinstance(actor, dict) and actor.get("name"):
            return {
                "id": actor.get("id"),
                "name": actor["name"],
                "email": actor.get("email"),
                "role": actor.get("role") or "lawyer",
            }
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, AttributeError):
        if token and "." not in token and len(token) <= 64:
            fallback_name = token
    return {"id": None, "name": fallback_name, "email": None, "role": "admin"}


def verify_dashboard_actor(token: str = Depends(verify_dashboard_token)) -> dict:
    """Dashboard session + WHO it is. Use on every accountable action."""
    return _actor_from_token(token)


def verify_client_or_dashboard_access(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_magic_token: Optional[str] = Header(None),
) -> AuthContext:
    """Validate dashboard session (cookie or bearer) or client magic-link token."""
    token = _dashboard_token(request, authorization)
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
    request: Request = None,
    authorization: Optional[str] = Header(None),
    x_agent_token: Optional[str] = Header(None),
) -> AuthContext:
    """Validate dashboard auth (cookie or bearer) or a server-to-server agent token.

    AGENT_API_TOKEN is optional so local dashboard-only development keeps
    working. When set, callers may provide it as either Bearer or X-Agent-Token.
    """
    dashboard_token = _dashboard_token(request, authorization)
    if dashboard_token and _is_active_dashboard_token(dashboard_token):
        return AuthContext(kind="dashboard", token=dashboard_token)

    configured_agent_token = os.getenv("AGENT_API_TOKEN", "")
    bearer_token = _extract_bearer_token(authorization)
    provided_agent_token = x_agent_token or bearer_token
    if (
        configured_agent_token
        and provided_agent_token
        and secrets.compare_digest(provided_agent_token, configured_agent_token)
    ):
        return AuthContext(kind="agent", token=provided_agent_token)

    raise HTTPException(status_code=401, detail="Missing or invalid authorization")


@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    client = client_ip(request)
    _check_rate_limit(client)

    actor = None
    if req.email and req.email.strip():
        # Per-lawyer login (#52).
        from services.db import EWDbWriter
        with EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
            lawyer = db.get_lawyer_by_email(req.email)
        if (
            not lawyer or not lawyer.get("active")
            or not _verify_password(req.password, lawyer.get("password_hash"))
        ):
            _record_failed_login(client)
            # One message for every failure mode: which part was wrong is
            # exactly what an attacker wants to learn.
            raise HTTPException(status_code=401, detail="Invalid email or password")
        actor = dict(lawyer)
        with EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
            db.touch_lawyer_login(str(lawyer["id"]))
    else:
        configured = _configured_password()
        if not configured:
            raise HTTPException(503, "Dashboard authentication is not configured")
        if not _verify_password(req.password, configured):
            _record_failed_login(client)
            raise HTTPException(status_code=401, detail="Invalid password")
        logger.warning(
            "Shared-password dashboard login used (deprecated, #52): actions "
            "in this session are attributed to 'dashboard', not a person."
        )
    _login_attempts.pop(client, None)
    try:
        token = _issue_session(actor)
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    # The token is deliberately not returned in the JSON body: a browser response
    # body is readable by JavaScript, which would defeat the HttpOnly boundary.
    # API clients should retain the Set-Cookie value in a cookie jar. Existing
    # Bearer-token verification remains available for trusted server callers.
    _set_session_cookies(response, token)
    return {
        "expires_in": SESSION_SECONDS,
        "actor": _actor_from_token(token),
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Revoke the presented session and clear its cookies."""
    token = _dashboard_token(request, request.headers.get("authorization"))
    if token and _is_active_dashboard_token(token):
        _revoke_dashboard_token(token)
    _clear_session_cookies(response)
    return {"message": "Logged out"}


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    request: Request,
    _token: str = Depends(verify_dashboard_token),
):
    # Require a valid dashboard session AND throttle by client so this endpoint
    # can't be used as an unauthenticated, unlimited password-verification oracle
    # that bypasses the login rate limiter.
    client = client_ip(request)
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


# ── Lawyer account management (#52) ──────────────────────────────────────────

class CreateLawyerRequest(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "lawyer"


class SetLawyerActiveRequest(BaseModel):
    active: bool


class OwnPasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


def _require_admin(actor: dict) -> None:
    if actor.get("role") != "admin":
        raise HTTPException(403, "Managing lawyer accounts requires an admin session")


@router.get("/lawyers")
async def list_lawyers(actor: dict = Depends(verify_dashboard_actor)):
    from services.db import EWDbWriter
    with EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
        lawyers = db.list_lawyers()
    return {"lawyers": [dict(l) for l in lawyers], "me": actor}


@router.post("/lawyers")
async def create_lawyer(
    req: CreateLawyerRequest,
    actor: dict = Depends(verify_dashboard_actor),
):
    """Create a lawyer account. Admin only — the legacy shared-password
    session acts as the bootstrap admin, so the FIRST real account can
    always be created; after that, prefer admin lawyer sessions."""
    _require_admin(actor)
    email = req.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "A valid email address is required")
    if not req.full_name.strip():
        raise HTTPException(400, "Full name is required")
    if len(req.password) < 12:
        raise HTTPException(400, "Password must be at least 12 characters")
    if req.role not in ("lawyer", "admin"):
        raise HTTPException(400, "Role must be lawyer or admin")
    from services.db import EWDbWriter
    with EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
        if db.get_lawyer_by_email(email):
            raise HTTPException(409, "An account with this email already exists")
        row = db.create_lawyer(email, req.full_name, _hash_password(req.password), req.role)
    logger.info("Lawyer account created: %s (%s) by %s", email, req.role, actor.get("name"))
    return dict(row)


@router.patch("/lawyers/{lawyer_id}")
async def set_lawyer_active(
    lawyer_id: str,
    req: SetLawyerActiveRequest,
    actor: dict = Depends(verify_dashboard_actor),
):
    _require_admin(actor)
    import uuid as _uuid
    try:
        _uuid.UUID(lawyer_id)
    except ValueError:
        raise HTTPException(404, "Lawyer not found")
    if not req.active and actor.get("id") == lawyer_id:
        raise HTTPException(409, "You cannot deactivate your own account")
    from services.db import EWDbWriter
    with EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
        row = db.set_lawyer_active(lawyer_id, req.active)
    if row is None:
        raise HTTPException(404, "Lawyer not found")
    logger.info("Lawyer account %s set active=%s by %s",
                row["email"], req.active, actor.get("name"))
    return dict(row)


@router.post("/lawyers/me/password")
async def change_own_password(
    req: OwnPasswordChangeRequest,
    actor: dict = Depends(verify_dashboard_actor),
):
    """A lawyer changes their OWN password (legacy shared-password sessions
    have no account and use the existing /change-password instead)."""
    if not actor.get("id"):
        raise HTTPException(400, "This session has no lawyer account")
    if len(req.new_password) < 12:
        raise HTTPException(400, "Password must be at least 12 characters")
    from services.db import EWDbWriter
    with EWDbWriter(os.getenv("DEFAULT_SCHEMA", "firm_demo")) as db:
        lawyer = db.get_lawyer_by_email(actor.get("email") or "")
        if not lawyer or not _verify_password(req.current_password, lawyer["password_hash"]):
            raise HTTPException(401, "Current password is incorrect")
        db.set_lawyer_password(str(lawyer["id"]), _hash_password(req.new_password))
    return {"changed": True}
