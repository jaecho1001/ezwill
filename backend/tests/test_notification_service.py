"""
Tests for GHL-based notification service.

Tests cover:
- GHL API configuration detection (_ghl_ready)
- Contact find-or-create (mocked httpx)
- Message sending (Email + SMS, mocked httpx)
- Stdout fallback when GHL not configured
- Bilingual (EN/KO) message content
- Disabled mode
"""
from __future__ import annotations

import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import notification_service as ns


# ── _ghl_ready ────────────────────────────────────────────────────

def test_ghl_not_ready_when_keys_missing(monkeypatch):
    monkeypatch.delenv("GHL_API_KEY", raising=False)
    monkeypatch.delenv("GHL_LOCATION_ID", raising=False)
    assert ns._ghl_ready() is False


def test_ghl_ready_when_both_keys_set(monkeypatch):
    monkeypatch.setenv("GHL_API_KEY", "test-key")
    monkeypatch.setenv("GHL_LOCATION_ID", "test-location")
    assert ns._ghl_ready() is True


def test_ghl_not_ready_when_only_key_set(monkeypatch):
    monkeypatch.setenv("GHL_API_KEY", "test-key")
    monkeypatch.delenv("GHL_LOCATION_ID", raising=False)
    assert ns._ghl_ready() is False


# ── _ghl_headers ──────────────────────────────────────────────────

def test_ghl_headers_include_bearer_and_version(monkeypatch):
    monkeypatch.setenv("GHL_API_KEY", "abc123")
    headers = ns._ghl_headers()
    assert headers["Authorization"] == "Bearer abc123"
    assert headers["Content-Type"] == "application/json"
    assert "Version" in headers


# ── send_magic_link_to_client — stdout fallback ───────────────────

@pytest.mark.asyncio
async def test_send_magic_link_stdout_mode_email_and_sms(monkeypatch, caplog):
    monkeypatch.setenv("NOTIFICATION_MODE", "stdout")
    # Reload module constant
    ns.NOTIFICATION_MODE = "stdout"

    import logging
    caplog.set_level(logging.INFO)

    result = await ns.send_magic_link_to_client(
        client_email="client@test.com",
        client_phone="+14165550123",
        client_first_name="John",
        client_last_name="Doe",
        magic_link_url="https://ezwill.app/will?t=abc",
        language="en",
    )
    assert result["email_sent"] is True
    assert result["sms_sent"] is True
    assert any("[CLIENT EMAIL]" in r.message for r in caplog.records)
    assert any("[CLIENT SMS]" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_send_magic_link_stdout_no_phone_no_sms(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_MODE", "stdout")
    ns.NOTIFICATION_MODE = "stdout"

    result = await ns.send_magic_link_to_client(
        client_email="client@test.com",
        client_phone=None,
        client_first_name="John",
        client_last_name="Doe",
        magic_link_url="https://ezwill.app/will?t=abc",
        language="en",
    )
    assert result["email_sent"] is True
    assert result["sms_sent"] is False


@pytest.mark.asyncio
async def test_send_magic_link_korean_content(monkeypatch, caplog):
    monkeypatch.setenv("NOTIFICATION_MODE", "stdout")
    ns.NOTIFICATION_MODE = "stdout"

    import logging
    caplog.set_level(logging.INFO)

    await ns.send_magic_link_to_client(
        client_email="client@test.com",
        client_phone="+14165550123",
        client_first_name="민수",
        client_last_name="김",
        magic_link_url="https://ezwill.app/will?t=abc",
        language="ko",
    )
    # Should contain Korean greeting
    all_logs = "\n".join(r.message for r in caplog.records)
    assert "민수" in all_logs
    assert "유언장" in all_logs


@pytest.mark.asyncio
async def test_send_magic_link_disabled_mode(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_MODE", "disabled")
    ns.NOTIFICATION_MODE = "disabled"

    result = await ns.send_magic_link_to_client(
        client_email="client@test.com",
        client_phone="+14165550123",
        client_first_name="John",
        client_last_name="Doe",
        magic_link_url="https://ezwill.app/will?t=abc",
        language="en",
    )
    assert result["email_sent"] is False
    assert result["sms_sent"] is False


# ── send_magic_link_to_client — GHL mode (mocked httpx) ───────────

@pytest.mark.asyncio
async def test_send_magic_link_ghl_mode_calls_api(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_MODE", "ghl")
    monkeypatch.setenv("GHL_API_KEY", "test-key")
    monkeypatch.setenv("GHL_LOCATION_ID", "test-location")
    ns.NOTIFICATION_MODE = "ghl"

    mock_client = AsyncMock()
    # Contact lookup returns empty
    mock_lookup = MagicMock(status_code=200, json=lambda: {"contacts": []})
    # Contact create returns contact_id
    mock_create = MagicMock(
        status_code=201, json=lambda: {"contact": {"id": "contact-123"}}
    )
    # Send message returns success
    mock_send = MagicMock(status_code=201, json=lambda: {"ok": True})

    mock_client.get = AsyncMock(return_value=mock_lookup)
    mock_client.post = AsyncMock(side_effect=[mock_create, mock_send, mock_send])

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_client
    mock_ctx.__aexit__.return_value = None

    with patch("services.notification_service.httpx.AsyncClient", return_value=mock_ctx):
        result = await ns.send_magic_link_to_client(
            client_email="client@test.com",
            client_phone="+14165550123",
            client_first_name="John",
            client_last_name="Doe",
            magic_link_url="https://ezwill.app/will?t=abc",
            language="en",
        )

    assert result["contact_id"] == "contact-123"
    # 3 POSTs: 1 create contact, 1 email send, 1 sms send
    assert mock_client.post.call_count == 3


# ── send_review_link_to_client ────────────────────────────────────

@pytest.mark.asyncio
async def test_send_review_link_stdout_mode(monkeypatch, caplog):
    monkeypatch.setenv("NOTIFICATION_MODE", "stdout")
    ns.NOTIFICATION_MODE = "stdout"

    import logging
    caplog.set_level(logging.INFO)

    result = await ns.send_review_link_to_client(
        client_email="client@test.com",
        client_phone="+14165550123",
        client_first_name="Jane",
        client_last_name="Smith",
        review_link_url="https://ezwill.app/review?t=xyz",
        language="en",
    )
    assert result["email_sent"] is True
    assert result["sms_sent"] is True
    logs = "\n".join(r.message for r in caplog.records)
    assert "ready for your review" in logs.lower() or "will is ready" in logs.lower()


@pytest.mark.asyncio
async def test_send_review_link_opt_out_email(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_MODE", "stdout")
    ns.NOTIFICATION_MODE = "stdout"

    result = await ns.send_review_link_to_client(
        client_email="client@test.com",
        client_phone="+14165550123",
        client_first_name="Jane",
        client_last_name="Smith",
        review_link_url="https://ezwill.app/review?t=xyz",
        language="en",
        send_email=False,
        send_sms=True,
    )
    assert result["email_sent"] is False
    assert result["sms_sent"] is True


# ── notify_lawyer_submission ──────────────────────────────────────

@pytest.mark.asyncio
async def test_notify_lawyer_submission_stdout(monkeypatch, caplog):
    monkeypatch.setenv("NOTIFICATION_MODE", "stdout")
    ns.NOTIFICATION_MODE = "stdout"

    import logging
    caplog.set_level(logging.INFO)

    draft = {
        "id": "draft-uuid",
        "client_first_name": "John",
        "client_last_name": "Doe",
        "client_email": "john@test.com",
        "client_phone": "+14165550123",
        "language": "en",
        "submitted_at": "2026-04-13T10:00:00Z",
    }
    flags = [
        {"severity": "critical", "title": "Missing FLA exclusion"},
        {"severity": "warning", "title": "No backup executor"},
    ]

    result = await ns.notify_lawyer_submission(draft, flags)
    assert result is True
    logs = "\n".join(r.message for r in caplog.records)
    assert "John Doe" in logs
    assert "CRITICAL" in logs
    assert "WARNING" in logs
    assert "Missing FLA exclusion" in logs


@pytest.mark.asyncio
async def test_notify_lawyer_submission_disabled(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_MODE", "disabled")
    ns.NOTIFICATION_MODE = "disabled"

    result = await ns.notify_lawyer_submission(
        {"id": "d", "client_first_name": "J", "client_last_name": "D"},
        [],
    )
    assert result is False


# ── send_signing_reminder ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_signing_reminder_bilingual(monkeypatch, caplog):
    monkeypatch.setenv("NOTIFICATION_MODE", "stdout")
    ns.NOTIFICATION_MODE = "stdout"

    import logging
    caplog.set_level(logging.INFO)

    # English
    await ns.send_signing_reminder(
        client_email="c@test.com",
        client_phone="+14165550123",
        client_first_name="John",
        signing_date="April 20, 2026 at 2:00 PM",
        signing_address="1110 Finch Ave West, Toronto",
        language="en",
    )
    logs_en = "\n".join(r.message for r in caplog.records)
    assert "Signing Appointment" in logs_en

    caplog.clear()

    # Korean
    await ns.send_signing_reminder(
        client_email="c@test.com",
        client_phone="+14165550123",
        client_first_name="민수",
        signing_date="2026년 4월 20일 오후 2시",
        signing_address="토론토 핀치 1110",
        language="ko",
    )
    logs_ko = "\n".join(r.message for r in caplog.records)
    assert "서명" in logs_ko
