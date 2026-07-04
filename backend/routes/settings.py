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
        return {"settings": db.get_firm_settings()}


@router.put("")
async def put_settings(body: SettingsBody, _token: str = Depends(verify_dashboard_token)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        return {"settings": db.upsert_firm_settings(body.settings)}
