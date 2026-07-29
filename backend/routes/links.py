from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from models import CreateLinkRequest, CreateLinkResponse
from services.db import EWDbWriter
from services.notification_service import send_magic_link_to_client, _notification_mode as notification_mode
from services.link_service import build_questionnaire_url
from services.client_ip import client_ip
from services.legacy_backfill import has_legacy_answers, legacy_draft_to_vault
from services.draft_service import get_full_draft
from routes.auth import verify_dashboard_token
from collections import deque
import os
import time
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")

# Resolve is public (a bare token is the only credential), so cap probing:
# generous enough for a client reopening their link across devices, far too
# slow for enumerating 122-bit random tokens.
RESOLVE_WINDOW_SECONDS = int(os.getenv("LINK_RESOLVE_RATE_WINDOW_SECS", "60"))
RESOLVE_MAX_PER_WINDOW = int(os.getenv("LINK_RESOLVE_RATE_MAX_REQS", "30"))
_resolve_hits: dict = {}


def _resolve_rate_limit(client: str) -> None:
    now = time.time()
    hits = _resolve_hits.setdefault(client, deque())
    while hits and now - hits[0] > RESOLVE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= RESOLVE_MAX_PER_WINDOW:
        raise HTTPException(429, "Too many link lookups; please try again shortly")
    hits.append(now)


@router.post("/create", response_model=CreateLinkResponse)
async def create_link(
    body: CreateLinkRequest,
    _token: str = Depends(verify_dashboard_token),
):
    """
    Create a new draft + magic link, then deliver the link to the client.
    - Sends email if body.send_email=True and client_email is provided
    - Sends SMS if body.send_sms=True and client_phone is provided
    """
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.create_draft(
            client_first_name=body.client_first_name,
            client_last_name=body.client_last_name,
            client_email=body.client_email,
            client_phone=body.client_phone,
            language=body.language,
        )

        link = db.create_link(
            draft_id=str(draft["id"]),
            client_email=body.client_email,
            client_name=f"{body.client_first_name} {body.client_last_name}",
        )

        token = str(link["token"])
        link_url = build_questionnaire_url(str(draft["id"]), token, body.language)

    # Deliver link via the configured notification provider. The response
    # carries HONEST per-channel status (#88): in stdout mode the message is
    # written to the server log and discarded, which previously surfaced to
    # the lawyer as unqualified success — a client who never receives their
    # link then reads as an unresponsive client for weeks.
    delivery = {"email_sent": False, "sms_sent": False}
    delivery_failed = False
    try:
        delivery = await send_magic_link_to_client(
            client_email=body.client_email,
            client_phone=body.client_phone,
            client_first_name=body.client_first_name,
            client_last_name=body.client_last_name,
            magic_link_url=link_url,
            language=body.language,
            send_email=body.send_email,
            send_sms=body.send_sms,
        )
        logger.info(
            f"Magic link delivery: email_sent={delivery['email_sent']} sms_sent={delivery['sms_sent']}"
        )
    except Exception as e:
        delivery_failed = True
        logger.error(f"Magic link delivery failed: {e}")

    def _channel_status(requested: bool, sent: bool) -> str:
        if not requested:
            return "not_requested"
        if delivery_failed:
            return "failed"
        if notification_mode() == "stdout":
            return "logged_only"
        return "sent" if sent else "failed"

    email_status = _channel_status(
        bool(body.send_email and body.client_email), delivery["email_sent"]
    )
    sms_status = _channel_status(
        bool(body.send_sms and body.client_phone), delivery["sms_sent"]
    )
    _record_deliveries(str(draft["id"]), "questionnaire",
                       email_status, sms_status)

    return CreateLinkResponse(
        token=token,
        draft_id=str(draft["id"]),
        link_url=link_url,
        expires_at=str(link["expires_at"]),
        email_delivery=email_status,
        sms_delivery=sms_status,
        client_name=f"{body.client_first_name} {body.client_last_name}",
    )


class ResolveLinkRequest(BaseModel):
    token: str


@router.post("/resolve")
async def resolve_link(body: ResolveLinkRequest, request: Request, response: Response):
    """Client-facing — resolves a magic link token (no auth).

    The token travels in the request BODY, never the URL path (review
    finding, #91): URL paths are written to server and proxy access logs,
    and the questionnaire token is a WRITE credential over the client's
    whole intake — strictly stronger than the review token that already
    moved out of URLs.

    Scope discipline (issue #77): this endpoint answers to a bare token, so it
    returns only what resuming the questionnaire needs. The vault is required
    for cross-device resume; the client's email and phone are NOT — the
    summary flow collects contact details from the client directly, and a
    leaked link must not also hand out how to reach them.
    """
    token = body.token
    _resolve_rate_limit(client_ip(request))
    response.headers["Cache-Control"] = "no-store"
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        link = db.resolve_link(token)
        if not link:
            raise HTTPException(404, "Link not found, expired, or revoked")

        db.mark_link_opened(token)

    vault = link.get("vault") or None
    if not vault:
        # Legacy backfill (issue #78): a client mid-way through the old
        # /will/* wizard has answers in the section columns, not the vault.
        # Project them read-only so the unified intake opens populated
        # instead of blank; nothing persists until the client's first save.
        full = get_full_draft(str(link["draft_id"]), DEFAULT_SCHEMA)
        if full and has_legacy_answers(full):
            vault = legacy_draft_to_vault(full)

    return {
        "draft_id": str(link["draft_id"]),
        "client_name": link["client_name"],
        "language": link["language"],
        "status": link["draft_status"],
        "current_step": link["current_step"],
        "completed_steps": link["completed_steps"] or [],
        "vault": vault,
        # Concurrency baseline for autosave (issue #92) — a counter, not PII.
        "revision": link.get("revision", 0),
    }


@router.post("/{token}/revoke")
async def revoke_link(
    token: str,
    _tok: str = Depends(verify_dashboard_token),
):
    """Revoke a magic link (dashboard-only)."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        db.execute(
            "UPDATE ew_client_links SET revoked = true WHERE token = %s",
            (token,),
        )
        return {"revoked": True}


def _record_deliveries(draft_id: str, kind: str,
                       email_status: str, sms_status: str) -> None:
    """Persist delivery attempts (#88). 'not_requested' is not an attempt."""
    try:
        with EWDbWriter(DEFAULT_SCHEMA) as db:
            for channel, status in (("email", email_status), ("sms", sms_status)):
                if status != "not_requested":
                    db.record_delivery(draft_id, kind, channel, status,
                                       provider_mode=notification_mode())
    except Exception:
        logger.exception("delivery log write failed (non-fatal)")


@router.post("/{draft_id}/resend")
async def resend_questionnaire_link(
    draft_id: str,
    send_email: bool = True,
    send_sms: bool = False,
    _token: str = Depends(verify_dashboard_token),
):
    """Re-deliver the client's ACTIVE questionnaire link (#88).

    Reuses the newest unexpired, unrevoked token — no new credential is
    minted, so previously shared links stay valid and the audit trail shows
    every attempt.
    """
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        # Questionnaire links ONLY (review finding, #91/#88): review links
        # live in the same table and are created later, so without the
        # filter a resend embedded the client's REVIEW token in a
        # questionnaire URL.
        link = db.fetchone("""
            SELECT token, expires_at FROM ew_client_links
            WHERE draft_id = %s
              AND COALESCE(link_type, 'questionnaire') != 'review'
              AND revoked = false AND expires_at > now()
            ORDER BY created_at DESC LIMIT 1
        """, (draft_id,))
    if not link:
        raise HTTPException(409, {
            "error": "no_active_link",
            "message": "No active link to resend — create a new one.",
        })

    link_url = build_questionnaire_url(draft_id, str(link["token"]),
                                       draft.get("language") or "en")
    delivery = {"email_sent": False, "sms_sent": False}
    delivery_failed = False
    try:
        delivery = await send_magic_link_to_client(
            client_email=draft.get("client_email"),
            client_phone=draft.get("client_phone"),
            client_first_name=draft.get("client_first_name") or "",
            client_last_name=draft.get("client_last_name") or "",
            magic_link_url=link_url,
            language=draft.get("language") or "en",
            send_email=send_email,
            send_sms=send_sms,
        )
    except Exception as exc:
        delivery_failed = True
        logger.error(f"Resend delivery failed: {exc}")

    def _status(requested: bool, sent: bool) -> str:
        if not requested:
            return "not_requested"
        if delivery_failed:
            return "failed"
        if notification_mode() == "stdout":
            return "logged_only"
        return "sent" if sent else "failed"

    email_status = _status(bool(send_email and draft.get("client_email")),
                           delivery["email_sent"])
    sms_status = _status(bool(send_sms and draft.get("client_phone")),
                         delivery["sms_sent"])
    _record_deliveries(draft_id, "questionnaire", email_status, sms_status)
    return {
        "resent": True,
        "email_delivery": email_status,
        "sms_delivery": sms_status,
        "link_url": link_url,
    }
