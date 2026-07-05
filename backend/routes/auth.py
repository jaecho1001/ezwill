"""Simple password-based auth for the EZWill lawyer dashboard."""

from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from dataclasses import dataclass
from typing import Optional
import os
import secrets
import time

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In production: store hashed password in DB. For now: env var.
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD", "vaturi2026")

# In-memory token store: {token: expiry_timestamp}
_active_tokens: dict = {}


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
    if not expiry or time.time() > expiry:
        _active_tokens.pop(token, None)
        return False
    return True


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
async def login(req: LoginRequest):
    if req.password != DASHBOARD_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = secrets.token_urlsafe(32)
    _active_tokens[token] = time.time() + 86400  # 24 hours
    # Clean up expired tokens
    now = time.time()
    expired = [t for t, exp in _active_tokens.items() if now > exp]
    for t in expired:
        del _active_tokens[t]
    return {"token": token, "expires_in": 86400}


@router.post("/change-password")
async def change_password(req: ChangePasswordRequest):
    global DASHBOARD_PASSWORD
    if req.current_password != DASHBOARD_PASSWORD:
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    DASHBOARD_PASSWORD = req.new_password
    return {"message": "Password changed successfully"}
