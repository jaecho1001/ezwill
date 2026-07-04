"""
Notification Service for EZWill.

Sends email and SMS via GoHighLevel (GHL) Conversations API.
Replaces SendGrid — uses GHL as the unified messaging channel.

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
  NOTIFICATION_MODE — 'ghl' (default), 'stdout' (dev), or 'disabled'
"""
from __future__ import annotations

import os
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

GHL_BASE_URL = "https://services.leadconnectorhq.com"
GHL_API_VERSION = "2021-07-28"

FIRM_EMAIL = os.getenv("FIRM_EMAIL", "lawyers@vaturicho.com")
FIRM_NAME = os.getenv("FIRM_NAME", "Vaturi & Cho LLP")
FIRM_PHONE = os.getenv("FIRM_PHONE", "+14166614529")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@ezwill.app")
NOTIFICATION_MODE = os.getenv("NOTIFICATION_MODE", "ghl")


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


async def _send_firm_email(subject: str, body: str) -> bool:
    """Send email to the firm's own inbox (lawyer notification)."""
    if NOTIFICATION_MODE == "disabled":
        return False
    if NOTIFICATION_MODE == "stdout" or not _ghl_ready():
        logger.info(f"[FIRM EMAIL] {subject}\n{body}")
        return True

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

async def notify_lawyer_submission(draft: dict, flags: list) -> bool:
    """
    Notify the firm when a client submits their will questionnaire.
    Sent via GHL email to FIRM_EMAIL.
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
    Delivered via GHL as both Email and SMS (if phone provided).
    Returns: {'email_sent': bool, 'sms_sent': bool, 'contact_id': str | None}
    """
    FIRM_NAME = _resolve_firm_name()
    result = {"email_sent": False, "sms_sent": False, "contact_id": None}

    if NOTIFICATION_MODE == "disabled":
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
    if NOTIFICATION_MODE == "stdout" or not _ghl_ready():
        if send_email and client_email:
            logger.info(f"[CLIENT EMAIL] To: {client_email}\nSubject: {email_subject}\n{body_text}")
            result["email_sent"] = True
        if send_sms and client_phone:
            logger.info(f"[CLIENT SMS] To: {client_phone}\n{sms_text}")
            result["sms_sent"] = True
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
    Delivered via GHL as both Email and SMS (if phone provided).
    """
    FIRM_NAME = _resolve_firm_name()
    result = {"email_sent": False, "sms_sent": False, "contact_id": None}

    if NOTIFICATION_MODE == "disabled":
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

    if NOTIFICATION_MODE == "stdout" or not _ghl_ready():
        if send_email and client_email:
            logger.info(f"[CLIENT EMAIL] To: {client_email}\nSubject: {email_subject}\n{body_text}")
            result["email_sent"] = True
        if send_sms and client_phone:
            logger.info(f"[CLIENT SMS] To: {client_phone}\n{sms_text}")
            result["sms_sent"] = True
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
    Delivered via GHL.
    """
    FIRM_NAME = _resolve_firm_name()
    result = {"email_sent": False, "sms_sent": False}
    if NOTIFICATION_MODE == "disabled":
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

    if NOTIFICATION_MODE == "stdout" or not _ghl_ready():
        if client_email:
            logger.info(f"[CLIENT EMAIL] {email_subject}\n{body_text}")
            result["email_sent"] = True
        if client_phone:
            logger.info(f"[CLIENT SMS] {sms_text}")
            result["sms_sent"] = True
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
