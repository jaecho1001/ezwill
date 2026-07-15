"""Firm settings for the EZWill lawyer dashboard (single blob per firm schema)."""

import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from routes.auth import verify_dashboard_token
from services.db import EWDbWriter

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")


class SettingsBody(BaseModel):
    # Stored verbatim as JSONB; the frontend owns the shape
    # ({firm, will, notifications, branding}).
    settings: dict


@router.get("")
async def get_settings(_token: str = Depends(verify_dashboard_token)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        settings = db.get_firm_settings() or {}
        # Authentication material shares the settings JSON for persistence but
        # must never be returned to browser code.
        return {"settings": {k: v for k, v in settings.items() if k != "_auth"}}


@router.put("")
async def put_settings(body: SettingsBody, _token: str = Depends(verify_dashboard_token)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        existing = db.get_firm_settings() or {}
        settings = {k: v for k, v in body.settings.items() if k != "_auth"}
        if "_auth" in existing:
            settings["_auth"] = existing["_auth"]
        saved = db.upsert_firm_settings(settings)
        return {"settings": {k: v for k, v in saved.items() if k != "_auth"}}
