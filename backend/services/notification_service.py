"""
Notification Service for EZWill.

Sends email and SMS via GoHighLevel (GHL) Conversations API, with optional
SMTP email delivery for firms that want to use their own mail provider.

Three notification types:
  1. Lawyer notification on client submission (email to firm)
  2. Client magic link delivery (email + SMS to client)
  3. Client review link delivery (email + SMS to client)

GHL API Reference:
  POST /conversations/messages   — send email or SMS to a contact
  GET  /contacts/lookup          — find contact by email/phone
  POST /contacts                 — create contact if not found

Environment variables:
  GHL_API_KEY       — Bearer token for GHL API
  GHL_LOCATION_ID   — GHL sub-account location ID
  FIRM_EMAIL        — firm email address for lawyer notifications
  FIRM_NAME         — firm display name in messages
  BASE_URL          — frontend base URL for dashboard links
  NOTIFICATION_MODE — 'ghl' (default), 'smtp', 'stdout' (dev), or 'disabled'
  SMTP_HOST        — SMTP server host (required for NOTIFICATION_MODE=smtp)
  SMTP_PORT        — SMTP server port (defaults to 465 for SSL, 587 otherwise)
  SMTP_USERNAME    — optional SMTP username
  SMTP_PASSWORD    — optional SMTP password
  SMTP_USE_TLS     — true/false, use STARTTLS (default true unless SSL is true)
  SMTP_USE_SSL     — true/false, connect with SMTP_SSL (default false)
  FROM_EMAIL       — sender address
  FROM_NAME        — optional sender display name
"""
from __future__ import annotations

import os
import logging
import re
import smtplib
from datetime import date, datetime, time, timezone
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional, Any

import httpx

logger = logging.getLogger(__name__)

GHL_BASE_URL = "https://services.leadconnectorhq.com"
GHL_API_VERSION = "2021-07-28"

FIRM_EMAIL = os.getenv("FIRM_EMAIL", "lawyers@vaturicho.com")
FIRM_NAME = os.getenv("FIRM_NAME", "Vaturi & Cho LLP")
FIRM_PHONE = os.getenv("FIRM_PHONE", "+14166614529")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@ezwill.app")
FROM_NAME = os.getenv("FROM_NAME", "EZWill")
NOTIFICATION_MODE = os.getenv("NOTIFICATION_MODE", "ghl")


GHL_TAGS = {
    "CHANNEL_EMAIL": "ezwill-channel-email",
    "CHANNEL_SMS": "ezwill-channel-sms",
    "REMINDER_QUARTERLY": "ezwill-reminder-quarterly",
    "REMINDER_BIANNUAL": "ezwill-reminder-biannual",
    "REMINDER_ANNUAL": "ezwill-reminder-annual",
    "REMINDER_BIENNIAL": "ezwill-reminder-biennial",
    "REMINDER_CUSTOM": "ezwill-reminder-custom",
    "EVENT_MARRIAGE": "ezwill-event-marriage",
    "EVENT_CHILD_BIRTH": "ezwill-event-child-birth",
    "EVENT_HOME_PURCHASE": "ezwill-event-home-purchase",
    "EVENT_BUSINESS": "ezwill-event-business",
    "EVENT_RETIREMENT": "ezwill-event-retirement",
    "EVENT_RELOCATION": "ezwill-event-relocation",
    "EVENT_BENEFICIARY_DEATH": "ezwill-event-beneficiary-death",
    "EVENT_HEALTH_CHANGE": "ezwill-event-health-change",
    "STATUS_WILL_COMPLETE": "ezwill-status-will-complete",
    "STATUS_WILL_SIGNED": "ezwill-status-will-signed",
    "STATUS_PAID": "ezwill-status-paid",
    "ENGAGEMENT_STARTED_QUIZ": "ezwill-engagement-started-quiz",
    "ENGAGEMENT_COMPLETED_QUIZ": "ezwill-engagement-completed-quiz",
    "ENGAGEMENT_ABANDONED_QUIZ": "ezwill-engagement-abandoned-quiz",
}

LIFE_EVENT_TAG_MAP = {
    "marriage": GHL_TAGS["EVENT_MARRIAGE"],
    "child-birth": GHL_TAGS["EVENT_CHILD_BIRTH"],
    "home-purchase": GHL_TAGS["EVENT_HOME_PURCHASE"],
    "business": GHL_TAGS["EVENT_BUSINESS"],
    "retirement": GHL_TAGS["EVENT_RETIREMENT"],
    "relocation": GHL_TAGS["EVENT_RELOCATION"],
    "beneficiary-death": GHL_TAGS["EVENT_BENEFICIARY_DEATH"],
    "health-change": GHL_TAGS["EVENT_HEALTH_CHANGE"],
}

FREQUENCY_TAG_MAP = {
    "quarterly": GHL_TAGS["REMINDER_QUARTERLY"],
    "biannual": GHL_TAGS["REMINDER_BIANNUAL"],
    "yearly": GHL_TAGS["REMINDER_ANNUAL"],
    "biennial": GHL_TAGS["REMINDER_BIENNIAL"],
}

MANAGED_REMINDER_TAGS = [
    GHL_TAGS["CHANNEL_EMAIL"],
    GHL_TAGS["CHANNEL_SMS"],
    *FREQUENCY_TAG_MAP.values(),
    GHL_TAGS["REMINDER_CUSTOM"],
    *LIFE_EVENT_TAG_MAP.values(),
]

CUSTOM_REMINDER_MARKER_PREFIX = "EZWILL_CUSTOM_REMINDER:"

ENGAGEMENT_TAG_MAP = {
    "started-quiz": GHL_TAGS["ENGAGEMENT_STARTED_QUIZ"],
    "completed-quiz": GHL_TAGS["ENGAGEMENT_COMPLETED_QUIZ"],
    "abandoned-quiz": GHL_TAGS["ENGAGEMENT_ABANDONED_QUIZ"],
    "paid": GHL_TAGS["STATUS_PAID"],
    "will-signed": GHL_TAGS["STATUS_WILL_SIGNED"],
}


def _resolve_firm_name() -> str:
    """Firm name from saved dashboard settings, falling back to the env/default,
    so email + SMS branding reflects what the lawyer configured."""
    try:
        from services.db import EWDbWriter
        schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
        with EWDbWriter(schema) as db:
            name = (db.get_firm_settings().get("firm") or {}).get("firmName")
            if name:
                return name
    except Exception:
        pass
    return FIRM_NAME


# ──────────────────────────────────────────────────────────────────
# GHL API Wrapper
# ──────────────────────────────────────────────────────────────────

def _ghl_headers() -> dict:
    """Standard GHL API headers."""
    return {
        "Authorization": f"Bearer {os.getenv('GHL_API_KEY', '')}",
        "Content-Type": "application/json",
        "Version": GHL_API_VERSION,
    }


def _ghl_ready() -> bool:
    """Check GHL is configured."""
    return bool(os.getenv("GHL_API_KEY") and os.getenv("GHL_LOCATION_ID"))


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _smtp_config() -> dict[str, Any] | None:
    """Read and validate SMTP settings from the environment."""
    host = (os.getenv("SMTP_HOST") or "").strip()
    if not host:
        logger.error("SMTP delivery requested but SMTP_HOST is not configured")
        return None

    use_ssl = _env_bool("SMTP_USE_SSL", False)
    use_tls = _env_bool("SMTP_USE_TLS", not use_ssl)
    raw_port = (os.getenv("SMTP_PORT") or "").strip()
    try:
        port = int(raw_port) if raw_port else (465 if use_ssl else 587)
    except ValueError:
        logger.error("SMTP delivery requested but SMTP_PORT is invalid: %s", raw_port)
        return None

    username = (os.getenv("SMTP_USERNAME") or "").strip()
    password = os.getenv("SMTP_PASSWORD") or ""
    if bool(username) != bool(password):
        logger.error("SMTP_USERNAME and SMTP_PASSWORD must either both be set or both be empty")
        return None

    from_email = (os.getenv("FROM_EMAIL") or FROM_EMAIL or "").strip()
    if not from_email:
        logger.error("SMTP delivery requested but FROM_EMAIL is not configured")
        return None

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "use_tls": use_tls,
        "use_ssl": use_ssl,
        "from_email": from_email,
        "from_name": (os.getenv("FROM_NAME") or FROM_NAME or "").strip(),
    }


def _smtp_ready() -> bool:
    """Check whether SMTP has the minimum config needed to attempt delivery."""
    return _smtp_config() is not None


def _notification_mode() -> str:
    return (NOTIFICATION_MODE or "").strip().lower()


def _send_smtp_email(
    to_email: str,
    subject: str,
    body: str,
    html: Optional[str] = None,
) -> bool:
    """Send one email via SMTP. Returns False on config or provider failure."""
    config = _smtp_config()
    if not config:
        return False

    message = EmailMessage()
    from_name = config["from_name"]
    message["From"] = formataddr((from_name, config["from_email"])) if from_name else config["from_email"]
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)
    if html:
        message.add_alternative(html, subtype="html")

    try:
        smtp_cls = smtplib.SMTP_SSL if config["use_ssl"] else smtplib.SMTP
        with smtp_cls(config["host"], config["port"], timeout=10) as smtp:
            if config["use_tls"] and not config["use_ssl"]:
                smtp.starttls()
            if config["username"]:
                smtp.login(config["username"], config["password"])
            smtp.send_message(message)
        logger.info("SMTP email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("SMTP email send failed to %s: %s", to_email, e)
        return False


async def _find_or_create_contact(
    email: Optional[str] = None,
    phone: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
) -> Optional[str]:
    """
    Find a GHL contact by email or phone. Create if not found.
    Returns contact_id or None on failure.
    """
    if not _ghl_ready():
        return None

    location_id = os.getenv("GHL_LOCATION_ID", "")
    async with httpx.AsyncClient(timeout=10) as client:
        # Try lookup first
        if email or phone:
            try:
                params = {"locationId": location_id}
                if email:
                    params["email"] = email
                if phone:
                    params["phone"] = phone
                res = await client.get(
                    f"{GHL_BASE_URL}/contacts/lookup",
                    headers=_ghl_headers(),
                    params=params,
                )
                if res.status_code == 200:
                    data = res.json()
                    contacts = data.get("contacts", [])
                    if contacts:
                        return contacts[0].get("id")
            except Exception as e:
                logger.warning(f"GHL contact lookup failed: {e}")

        # Create contact if not found
        payload: dict = {"locationId": location_id}
        if email:
            payload["email"] = email
        if phone:
            payload["phone"] = phone
        if first_name:
            payload["firstName"] = first_name
        if last_name:
            payload["lastName"] = last_name

        try:
            res = await client.post(
                f"{GHL_BASE_URL}/contacts/",
                headers=_ghl_headers(),
                json=payload,
            )
            if res.status_code in (200, 201):
                return res.json().get("contact", {}).get("id")
            logger.warning(f"GHL contact create failed: {res.status_code} {res.text[:200]}")
        except Exception as e:
            logger.error(f"GHL contact create error: {e}")

        return None


async def _send_ghl_message(
    contact_id: str,
    message_type: str,  # 'Email' or 'SMS'
    subject: Optional[str],
    body: str,
    html: Optional[str] = None,
) -> bool:
    """
    Send a message via GHL Conversations API.
    Returns True on success, False otherwise.
    """
    if not _ghl_ready() or not contact_id:
        return False

    payload: dict = {
        "type": message_type,
        "contactId": contact_id,
        "message": body,
    }
    if message_type == "Email":
        if subject:
            payload["subject"] = subject
        if html:
            payload["html"] = html
        payload["emailFrom"] = FROM_EMAIL

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{GHL_BASE_URL}/conversations/messages",
                headers=_ghl_headers(),
                json=payload,
            )
            if res.status_code in (200, 201):
                logger.info(f"GHL {message_type} sent to {contact_id}")
                return True
            logger.warning(
                f"GHL {message_type} failed: {res.status_code} {res.text[:200]}"
            )
            return False
    except Exception as e:
        logger.error(f"GHL send error: {e}")
        return False


def _unique_tags(tags: list[str]) -> list[str]:
    seen = set()
    unique = []
    for tag in tags:
        if tag and tag not in seen:
            seen.add(tag)
            unique.append(tag)
    return unique


def _normalized_custom_reminders(preferences: dict[str, Any]) -> list[dict[str, Any]]:
    reminders = []
    for raw in preferences.get("custom_reminders") or []:
        if not isinstance(raw, dict):
            continue
        label = str(raw.get("label") or "").strip()
        date_text = str(raw.get("date") or "").strip()
        if not label or not date_text:
            continue
        reminders.append({
            "id": str(raw.get("id") or "").strip(),
            "label": label,
            "date": date_text,
            "recurring": bool(raw.get("recurring")),
        })
    return reminders


def _desired_reminder_tags(preferences: dict[str, Any]) -> list[str]:
    """Translate app reminder preferences into managed GHL workflow tags."""
    tags: list[str] = []
    if preferences.get("email_enabled"):
        tags.append(GHL_TAGS["CHANNEL_EMAIL"])
    if preferences.get("sms_enabled"):
        tags.append(GHL_TAGS["CHANNEL_SMS"])

    if preferences.get("annual_reminder"):
        frequency_tag = FREQUENCY_TAG_MAP.get(str(preferences.get("annual_frequency", "")))
        if frequency_tag:
            tags.append(frequency_tag)

    if _normalized_custom_reminders(preferences):
        tags.append(GHL_TAGS["REMINDER_CUSTOM"])

    for event_id in preferences.get("enabled_life_events") or []:
        event_tag = LIFE_EVENT_TAG_MAP.get(str(event_id))
        if event_tag:
            tags.append(event_tag)

    return _unique_tags(tags)


async def _add_ghl_tags(contact_id: str, tags: list[str]) -> bool:
    tags = _unique_tags(tags)
    if not tags:
        return True
    if not _ghl_ready() or not contact_id:
        return False

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{GHL_BASE_URL}/contacts/{contact_id}/tags",
                headers=_ghl_headers(),
                json={"tags": tags},
            )
            if res.status_code in (200, 201):
                logger.info(f"GHL tags added to {contact_id}: {tags}")
                return True
            logger.warning(f"GHL add tags failed: {res.status_code} {res.text[:200]}")
    except Exception as e:
        logger.error(f"GHL add tags error: {e}")
    return False


async def _get_ghl_contact_tags(contact_id: str) -> list[str] | None:
    if not _ghl_ready() or not contact_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{GHL_BASE_URL}/contacts/{contact_id}",
                headers=_ghl_headers(),
            )
            if res.status_code == 200:
                contact = res.json().get("contact") or {}
                tags = contact.get("tags") or []
                return [str(tag) for tag in tags if tag]
            logger.warning(f"GHL contact fetch failed: {res.status_code} {res.text[:200]}")
    except Exception as e:
        logger.error(f"GHL contact fetch error: {e}")
    return None


async def _remove_ghl_tags(contact_id: str, tags: list[str]) -> bool:
    tags = _unique_tags(tags)
    if not tags:
        return True
    if not _ghl_ready() or not contact_id:
        return False

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.request(
                "DELETE",
                f"{GHL_BASE_URL}/contacts/{contact_id}/tags",
                headers=_ghl_headers(),
                json={"tags": tags},
            )
            if res.status_code in (200, 201, 204):
                logger.info(f"GHL managed reminder tags removed from {contact_id}")
                return True
            logger.warning(f"GHL remove tags failed: {res.status_code} {res.text[:200]}")
    except Exception as e:
        logger.error(f"GHL remove tags error: {e}")
    return False


def _custom_reminder_key(reminder: dict[str, Any]) -> str:
    raw_key = str(reminder.get("id") or "").strip()
    if not raw_key:
        raw_key = f"{reminder.get('date', '')}:{reminder.get('label', '')}"
    key = re.sub(r"[^A-Za-z0-9_.:-]+", "-", raw_key).strip("-")
    return key[:120] or "reminder"


def _custom_reminder_marker(reminder: dict[str, Any]) -> str:
    return f"{CUSTOM_REMINDER_MARKER_PREFIX}{_custom_reminder_key(reminder)}"


def _custom_reminder_due_at(reminder: dict[str, Any]) -> str | None:
    try:
        reminder_date = date.fromisoformat(str(reminder.get("date", ""))[:10])
    except ValueError:
        return None
    due_at = datetime.combine(reminder_date, time(hour=14), tzinfo=timezone.utc)
    return due_at.isoformat().replace("+00:00", "Z")


def _custom_reminder_body(user: dict[str, Any], reminder: dict[str, Any]) -> str:
    recurring = "Yes" if reminder.get("recurring") else "No"
    client = user.get("name") or "EZWill client"
    return "\n".join([
        _custom_reminder_marker(reminder),
        f"Client: {client}",
        f"Reminder: {reminder.get('label', '')}",
        f"Date: {reminder.get('date', '')}",
        f"Recurring yearly: {recurring}",
        "Created from EZWill reminder preferences.",
    ])


def _extract_custom_reminder_key(task: dict[str, Any]) -> str | None:
    marker_text = f"{task.get('body') or ''}\n{task.get('title') or ''}"
    match = re.search(
        rf"{re.escape(CUSTOM_REMINDER_MARKER_PREFIX)}([A-Za-z0-9_.:-]+)",
        marker_text,
    )
    return match.group(1) if match else None


async def _get_ghl_tasks(contact_id: str) -> list[dict[str, Any]] | None:
    if not _ghl_ready() or not contact_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{GHL_BASE_URL}/contacts/{contact_id}/tasks",
                headers=_ghl_headers(),
            )
            if res.status_code == 200:
                tasks = res.json().get("tasks") or []
                return [dict(task) for task in tasks if isinstance(task, dict)]
            logger.warning(f"GHL task fetch failed: {res.status_code} {res.text[:200]}")
    except Exception as e:
        logger.error(f"GHL task fetch error: {e}")
    return None


async def _create_ghl_task(
    contact_id: str,
    user: dict[str, Any],
    reminder: dict[str, Any],
) -> str | None:
    due_at = _custom_reminder_due_at(reminder)
    if not due_at:
        return None

    title = f"EZWill review reminder: {reminder.get('label', '')}"[:120]
    payload = {
        "title": title,
        "body": _custom_reminder_body(user, reminder),
        "dueDate": due_at,
        "completed": False,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{GHL_BASE_URL}/contacts/{contact_id}/tasks",
                headers=_ghl_headers(),
                json=payload,
            )
            if res.status_code in (200, 201):
                task = res.json().get("task") or {}
                logger.info(f"GHL custom reminder task created for {contact_id}: {title}")
                return task.get("id") or _custom_reminder_key(reminder)
            logger.warning(f"GHL task create failed: {res.status_code} {res.text[:200]}")
    except Exception as e:
        logger.error(f"GHL task create error: {e}")
    return None


async def _delete_ghl_task(contact_id: str, task_id: str) -> bool:
    if not task_id:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.delete(
                f"{GHL_BASE_URL}/contacts/{contact_id}/tasks/{task_id}",
                headers=_ghl_headers(),
            )
            if res.status_code in (200, 204):
                logger.info(f"GHL custom reminder task deleted: {task_id}")
                return True
            logger.warning(f"GHL task delete failed: {res.status_code} {res.text[:200]}")
    except Exception as e:
        logger.error(f"GHL task delete error: {e}")
    return False


async def _sync_custom_reminder_tasks(
    contact_id: str,
    user: dict[str, Any],
    preferences: dict[str, Any],
) -> dict[str, Any]:
    desired_reminders = _normalized_custom_reminders(preferences)
    result: dict[str, Any] = {
        "success": True,
        "created": [],
        "deleted": [],
        "skipped": [],
        "desired": len(desired_reminders),
    }

    tasks = await _get_ghl_tasks(contact_id)
    if tasks is None:
        result["success"] = False
        result["skipped"] = [_custom_reminder_key(r) for r in desired_reminders]
        return result

    existing: dict[str, dict[str, Any]] = {}
    for task in tasks:
        key = _extract_custom_reminder_key(task)
        if key and key not in existing:
            existing[key] = task

    desired_by_key = {_custom_reminder_key(reminder): reminder for reminder in desired_reminders}

    for key, task in existing.items():
        if key in desired_by_key:
            continue
        task_id = str(task.get("id") or "")
        if await _delete_ghl_task(contact_id, task_id):
            result["deleted"].append(task_id)
        else:
            result["success"] = False
            result["skipped"].append(key)

    for key, reminder in desired_by_key.items():
        if key in existing:
            continue
        task_id = await _create_ghl_task(contact_id, user, reminder)
        if task_id:
            result["created"].append(task_id)
        else:
            result["success"] = False
            result["skipped"].append(key)

    return result


async def _send_firm_email(subject: str, body: str) -> bool:
    """Send email to the firm's own inbox (lawyer notification)."""
    mode = _notification_mode()
    if mode == "disabled":
        return False
    if mode == "smtp":
        return _send_smtp_email(FIRM_EMAIL, subject, body)
    if mode == "stdout" or not _ghl_ready():
        logger.info(f"[FIRM EMAIL] {subject}\n{body}")
        return False

    contact_id = await _find_or_create_contact(
        email=FIRM_EMAIL,
        first_name="Firm",
        last_name="Notifications",
    )
    if not contact_id:
        logger.info(f"[FIRM EMAIL — fallback to stdout] {subject}\n{body}")
        return False

    return await _send_ghl_message(contact_id, "Email", subject, body)


# ──────────────────────────────────────────────────────────────────
# Public API — used by routes
# ──────────────────────────────────────────────────────────────────

async def sync_reminder_preferences_to_ghl(
    user: dict[str, Any],
    preferences: dict[str, Any],
) -> dict[str, Any]:
    """
    Sync review-reminder preferences to GHL using the tag -> workflow pattern.

    The browser never calls GHL directly. This backend function calculates the
    managed workflow tags, upserts the contact, clears stale managed tags, and
    adds the current desired tags.
    """
    desired_tags = _desired_reminder_tags(preferences)
    result: dict[str, Any] = {
        "success": True,
        "ghl_synced": False,
        "contact_id": None,
        "tags_added": desired_tags,
        "tags_removed": [],
        "custom_tasks": {
            "success": True,
            "created": [],
            "deleted": [],
            "skipped": [],
            "desired": len(_normalized_custom_reminders(preferences)),
        },
    }

    if _notification_mode() == "disabled":
        result["success"] = False
        return result

    if _notification_mode() in {"stdout", "smtp"} or not _ghl_ready():
        logger.info(
            "[GHL REMINDER SYNC] %s <%s> tags=%s preferences=%s",
            user.get("name", "").strip(),
            preferences.get("email") or user.get("email") or "",
            desired_tags,
            preferences,
        )
        return result

    contact_id = await _find_or_create_contact(
        email=preferences.get("email") or user.get("email"),
        phone=preferences.get("phone") or user.get("phone"),
        first_name=user.get("first_name"),
        last_name=user.get("last_name"),
    )
    result["contact_id"] = contact_id
    if not contact_id:
        result["success"] = False
        return result

    current_tags = await _get_ghl_contact_tags(contact_id)
    if current_tags is None:
        tags_to_remove = MANAGED_REMINDER_TAGS
        tags_to_add = desired_tags
    else:
        current = set(current_tags)
        desired = set(desired_tags)
        tags_to_remove = [
            tag for tag in MANAGED_REMINDER_TAGS
            if tag in current and tag not in desired
        ]
        tags_to_add = [tag for tag in desired_tags if tag not in current]

    removed = await _remove_ghl_tags(contact_id, tags_to_remove)
    added = await _add_ghl_tags(contact_id, tags_to_add)
    custom_tasks = await _sync_custom_reminder_tasks(contact_id, user, preferences)
    result["tags_removed"] = tags_to_remove if removed else []
    result["tags_added"] = tags_to_add if added else []
    result["custom_tasks"] = custom_tasks
    result["ghl_synced"] = removed and added and custom_tasks["success"]
    result["success"] = result["ghl_synced"]
    return result


async def track_ghl_engagement(
    event: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
) -> bool:
    """Tag a contact for a lightweight engagement workflow in GHL."""
    tag = ENGAGEMENT_TAG_MAP.get(event)
    if not tag:
        return False
    if _notification_mode() == "disabled":
        return False
    if _notification_mode() in {"stdout", "smtp"} or not _ghl_ready():
        logger.info("[GHL ENGAGEMENT] %s -> %s", email or phone or "unknown", tag)
        return True

    contact_id = await _find_or_create_contact(
        email=email,
        phone=phone,
        first_name=first_name,
        last_name=last_name,
    )
    if not contact_id:
        return False
    return await _add_ghl_tags(contact_id, [tag])

async def notify_lawyer_submission(draft: dict, flags: list) -> bool:
    """
    Notify the firm when a client submits their will questionnaire.
    Sent through the configured email provider to FIRM_EMAIL.
    """
    FIRM_NAME = _resolve_firm_name()
    client_name = (
        f"{draft.get('client_first_name', '')} {draft.get('client_last_name', '')}".strip()
    )
    draft_id = str(draft.get("id", ""))

    critical_flags = [f for f in flags if f.get("severity") == "critical"]
    warning_flags = [f for f in flags if f.get("severity") == "warning"]

    flag_lines = []
    for f in critical_flags:
        flag_lines.append(f"  [CRITICAL] {f.get('title', '')}")
    for f in warning_flags:
        flag_lines.append(f"  [WARNING] {f.get('title', '')}")

    flags_text = "\n".join(flag_lines) if flag_lines else "  No issues detected"

    subject = f"Will Questionnaire Submitted — {client_name}"
    body = f"""
{client_name} has completed their will questionnaire.

Name:     {client_name}
Email:    {draft.get('client_email', 'Not provided')}
Phone:    {draft.get('client_phone', 'Not provided')}
Language: {'Korean' if draft.get('language') == 'ko' else 'English'}
Submitted: {draft.get('submitted_at', '')}

Ontario AI Flags:
{flags_text}

View in Dashboard:
{BASE_URL}/dashboard/clients/{draft_id}

---
EZWill — {FIRM_NAME}
"""
    return await _send_firm_email(subject, body)


async def send_magic_link_to_client(
    client_email: Optional[str],
    client_phone: Optional[str],
    client_first_name: str,
    client_last_name: str,
    magic_link_url: str,
    language: str = "en",
    send_sms: bool = True,
    send_email: bool = True,
) -> dict:
    """
    Send the client their will questionnaire magic link.
    Email is delivered through the configured provider; SMS is GHL-only.
    Returns: {'email_sent': bool, 'sms_sent': bool, 'contact_id': str | None}
    """
    FIRM_NAME = _resolve_firm_name()
    result = {"email_sent": False, "sms_sent": False, "contact_id": None}

    mode = _notification_mode()
    if mode == "disabled":
        return result

    # Build bilingual message
    is_korean = language == "ko"
    greeting = f"Hello {client_first_name}," if not is_korean else f"{client_first_name}님 안녕하세요,"

    if is_korean:
        email_subject = f"{FIRM_NAME} — 유언장 설문지"
        body_text = f"""{greeting}

{FIRM_NAME}에서 보내드리는 온라인 유언장 설문지입니다.
아래 링크를 클릭하여 진행해주시기 바랍니다:

{magic_link_url}

질문이 있으시면 언제든 연락주십시오.

{FIRM_NAME}
{FIRM_PHONE}
"""
        sms_text = f"""{FIRM_NAME}: {client_first_name}님, 유언장 설문지 링크입니다: {magic_link_url}"""
    else:
        email_subject = f"{FIRM_NAME} — Your Will Questionnaire"
        body_text = f"""{greeting}

Your estate planning lawyer at {FIRM_NAME} has prepared an online will questionnaire for you.

Please click the link below to begin:

{magic_link_url}

The questionnaire takes about 20 minutes. You can save your progress and return later.

If you have any questions, please don't hesitate to contact us.

{FIRM_NAME}
{FIRM_PHONE}
"""
        sms_text = f"""{FIRM_NAME}: Hi {client_first_name}, here's your will questionnaire link: {magic_link_url}"""

    # Stdout fallback for dev
    if mode == "smtp":
        if send_email and client_email:
            result["email_sent"] = _send_smtp_email(client_email, email_subject, body_text)
        if send_sms and client_phone:
            logger.info("[CLIENT SMS] SMTP notification mode does not send SMS; configure GHL for SMS delivery")
        return result

    if mode == "stdout" or not _ghl_ready():
        if send_email and client_email:
            logger.info(f"[CLIENT EMAIL] To: {client_email}\nSubject: {email_subject}\n{body_text}")
        if send_sms and client_phone:
            logger.info(f"[CLIENT SMS] To: {client_phone}\n{sms_text}")
        return result

    # Send via GHL
    contact_id = await _find_or_create_contact(
        email=client_email,
        phone=client_phone,
        first_name=client_first_name,
        last_name=client_last_name,
    )
    result["contact_id"] = contact_id

    if not contact_id:
        logger.warning("Could not create/find GHL contact for magic link delivery")
        return result

    if send_email and client_email:
        result["email_sent"] = await _send_ghl_message(
            contact_id, "Email", email_subject, body_text
        )
    if send_sms and client_phone:
        result["sms_sent"] = await _send_ghl_message(
            contact_id, "SMS", None, sms_text
        )

    return result


async def send_review_link_to_client(
    client_email: Optional[str],
    client_phone: Optional[str],
    client_first_name: str,
    client_last_name: str,
    review_link_url: str,
    language: str = "en",
    send_sms: bool = True,
    send_email: bool = True,
) -> dict:
    """
    Send the client their document review portal link.
    Email is delivered through the configured provider; SMS is GHL-only.
    """
    FIRM_NAME = _resolve_firm_name()
    result = {"email_sent": False, "sms_sent": False, "contact_id": None}

    mode = _notification_mode()
    if mode == "disabled":
        return result

    is_korean = language == "ko"
    greeting = f"Hello {client_first_name}," if not is_korean else f"{client_first_name}님 안녕하세요,"

    if is_korean:
        email_subject = f"{FIRM_NAME} — 유언장 검토 준비 완료"
        body_text = f"""{greeting}

귀하의 유언장 및 관련 서류 초안이 준비되었습니다.
아래 링크를 통해 검토하시고 승인해주시기 바랍니다:

{review_link_url}

질문이 있으시면 언제든 연락주십시오.

{FIRM_NAME}
{FIRM_PHONE}
"""
        sms_text = f"""{FIRM_NAME}: {client_first_name}님, 유언장 검토 링크: {review_link_url}"""
    else:
        email_subject = f"{FIRM_NAME} — Your Will is Ready for Review"
        body_text = f"""{greeting}

Your will and related estate planning documents are ready for your review.

Please click the link below to review each document carefully:

{review_link_url}

For each clause, you'll have the option to check "I understand" or leave a question for our team. Once you've approved all documents, we'll contact you to schedule a signing appointment.

Please review at your convenience — there is no rush. If you have any questions, please don't hesitate to contact us.

{FIRM_NAME}
{FIRM_PHONE}
"""
        sms_text = f"""{FIRM_NAME}: Hi {client_first_name}, your will is ready for review: {review_link_url}"""

    if mode == "smtp":
        if send_email and client_email:
            result["email_sent"] = _send_smtp_email(client_email, email_subject, body_text)
        if send_sms and client_phone:
            logger.info("[CLIENT SMS] SMTP notification mode does not send SMS; configure GHL for SMS delivery")
        return result

    if mode == "stdout" or not _ghl_ready():
        if send_email and client_email:
            logger.info(f"[CLIENT EMAIL] To: {client_email}\nSubject: {email_subject}\n{body_text}")
        if send_sms and client_phone:
            logger.info(f"[CLIENT SMS] To: {client_phone}\n{sms_text}")
        return result

    contact_id = await _find_or_create_contact(
        email=client_email,
        phone=client_phone,
        first_name=client_first_name,
        last_name=client_last_name,
    )
    result["contact_id"] = contact_id

    if not contact_id:
        return result

    if send_email and client_email:
        result["email_sent"] = await _send_ghl_message(
            contact_id, "Email", email_subject, body_text
        )
    if send_sms and client_phone:
        result["sms_sent"] = await _send_ghl_message(
            contact_id, "SMS", None, sms_text
        )

    return result


async def send_signing_reminder(
    client_email: Optional[str],
    client_phone: Optional[str],
    client_first_name: str,
    signing_date: str,
    signing_address: str,
    language: str = "en",
) -> dict:
    """
    Send a signing appointment reminder to the client.
    Email is delivered through the configured provider; SMS is GHL-only.
    """
    FIRM_NAME = _resolve_firm_name()
    result = {"email_sent": False, "sms_sent": False}
    mode = _notification_mode()
    if mode == "disabled":
        return result

    is_korean = language == "ko"

    if is_korean:
        email_subject = f"{FIRM_NAME} — 서명 일정 안내"
        body_text = f"""{client_first_name}님 안녕하세요,

유언장 서명 일정을 안내드립니다.

일시: {signing_date}
장소: {signing_address}

서명 당일, 사진이 있는 신분증을 지참해주시기 바랍니다.

{FIRM_NAME}
{FIRM_PHONE}
"""
        sms_text = f"{FIRM_NAME}: {client_first_name}님, 서명 일정: {signing_date}, {signing_address}"
    else:
        email_subject = f"{FIRM_NAME} — Signing Appointment Reminder"
        body_text = f"""Hello {client_first_name},

This is a reminder of your will signing appointment.

Date/Time: {signing_date}
Location:  {signing_address}

Please bring government-issued photo ID.

{FIRM_NAME}
{FIRM_PHONE}
"""
        sms_text = f"{FIRM_NAME}: Hi {client_first_name}, signing appointment: {signing_date} at {signing_address}"

    if mode == "smtp":
        if client_email:
            result["email_sent"] = _send_smtp_email(client_email, email_subject, body_text)
        if client_phone:
            logger.info("[CLIENT SMS] SMTP notification mode does not send SMS; configure GHL for SMS delivery")
        return result

    if mode == "stdout" or not _ghl_ready():
        if client_email:
            logger.info(f"[CLIENT EMAIL] {email_subject}\n{body_text}")
        if client_phone:
            logger.info(f"[CLIENT SMS] {sms_text}")
        return result

    contact_id = await _find_or_create_contact(
        email=client_email, phone=client_phone, first_name=client_first_name
    )
    if not contact_id:
        return result

    if client_email:
        result["email_sent"] = await _send_ghl_message(
            contact_id, "Email", email_subject, body_text
        )
    if client_phone:
        result["sms_sent"] = await _send_ghl_message(
            contact_id, "SMS", None, sms_text
        )

    return result
