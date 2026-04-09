"""Simple password-based auth for the EZWill lawyer dashboard."""

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
import os
import secrets
import time

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In production: store hashed password in DB. For now: env var.
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD", "vaturi2026")

# In-memory token store: {token: expiry_timestamp}
_active_tokens: dict = {}


class LoginRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def verify_dashboard_token(authorization: str = Header(None)) -> str:
    """FastAPI dependency that validates Bearer token on dashboard routes."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.replace("Bearer ", "")
    expiry = _active_tokens.get(token)
    if not expiry or time.time() > expiry:
        _active_tokens.pop(token, None)
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    return token


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
