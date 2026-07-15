import os
import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from models import ReminderPreferencesRequest
from routes.auth import verify_client_or_dashboard_draft_access
from services.db import EWDbWriter
from services.notification_service import (
    LIFE_EVENT_TAG_MAP,
    sync_reminder_preferences_to_ghl,
)

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _client_name(draft: dict) -> str:
    return f"{draft.get('client_first_name', '')} {draft.get('client_last_name', '')}".strip()


def _default_preferences(draft: dict) -> dict:
    return {
        "email_enabled": bool(draft.get("client_email")),
        "sms_enabled": False,
        "email": draft.get("client_email") or "",
        "phone": draft.get("client_phone") or "",
        "annual_reminder": True,
        "annual_frequency": "yearly",
        "enabled_life_events": [
            "marriage",
            "child-birth",
            "home-purchase",
            "beneficiary-death",
        ],
        "custom_reminders": [],
    }


def _validate_preferences(preferences: dict) -> dict:
    normalized = dict(preferences)
    normalized["email"] = (normalized.get("email") or "").strip()
    normalized["phone"] = (normalized.get("phone") or "").strip()
    normalized["enabled_life_events"] = [
        str(event_id)
        for event_id in normalized.get("enabled_life_events") or []
        if event_id in LIFE_EVENT_TAG_MAP
    ]

    if normalized.get("email_enabled") and not EMAIL_RE.match(normalized["email"]):
        raise HTTPException(400, "A valid email address is required for email reminders")
    if normalized.get("sms_enabled") and not normalized["phone"]:
        raise HTTPException(400, "A phone number is required for SMS reminders")

    for reminder in normalized.get("custom_reminders") or []:
        if not reminder.get("label") or not reminder.get("date"):
            raise HTTPException(400, "Custom reminders require both a label and a date")
        try:
            date.fromisoformat(str(reminder["date"])[:10])
        except ValueError:
            raise HTTPException(400, "Custom reminder dates must use YYYY-MM-DD format") from None

    return normalized


@router.get("/{draft_id}")
async def get_reminder_preferences(
    draft_id: str,
    _auth=Depends(verify_client_or_dashboard_draft_access),
):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        draft_dict = dict(draft)

    preferences = draft_dict.get("reminder_preferences") or {}
    if not preferences:
        preferences = _default_preferences(draft_dict)

    return {
        "draft_id": draft_id,
        "client_name": _client_name(draft_dict),
        "client_first_name": draft_dict.get("client_first_name") or "",
        "client_last_name": draft_dict.get("client_last_name") or "",
        "email": draft_dict.get("client_email") or "",
        "phone": draft_dict.get("client_phone") or "",
        "created_at": str(draft_dict.get("created_at") or ""),
        "preferences": preferences,
        "ghl_contact_id": draft_dict.get("ghl_contact_id"),
        "reminders_synced_at": (
            str(draft_dict.get("reminders_synced_at"))
            if draft_dict.get("reminders_synced_at")
            else None
        ),
    }


@router.post("/{draft_id}")
async def save_reminder_preferences(
    draft_id: str,
    body: ReminderPreferencesRequest,
    _auth=Depends(verify_client_or_dashboard_draft_access),
):
    preferences = _validate_preferences(body.model_dump())

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        draft_dict = dict(draft)

    user = {
        "first_name": draft_dict.get("client_first_name") or "",
        "last_name": draft_dict.get("client_last_name") or "",
        "name": _client_name(draft_dict),
        "email": draft_dict.get("client_email") or "",
        "phone": draft_dict.get("client_phone") or "",
    }

    sync_result = await sync_reminder_preferences_to_ghl(user, preferences)

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        updated = db.save_reminder_preferences(
            draft_id,
            preferences,
            ghl_contact_id=sync_result.get("contact_id"),
            synced=bool(sync_result.get("ghl_synced")),
        )
        if not updated:
            raise HTTPException(404, "Draft not found")

    return {
        "saved": True,
        "draft_id": draft_id,
        "preferences": preferences,
        "ghl": sync_result,
    }
