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


# ── SMTP provider ─────────────────────────────────────────────────

def test_smtp_not_ready_without_host(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    assert ns._smtp_ready() is False


def test_send_smtp_email_uses_starttls_and_auth(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USERNAME", "smtp-user")
    monkeypatch.setenv("SMTP_PASSWORD", "smtp-pass")
    monkeypatch.setenv("SMTP_USE_TLS", "true")
    monkeypatch.setenv("SMTP_USE_SSL", "false")
    monkeypatch.setenv("FROM_EMAIL", "noreply@example.com")
    monkeypatch.setenv("FROM_NAME", "EZWill Test")

    smtp = MagicMock()
    smtp_ctx = MagicMock()
    smtp_ctx.__enter__.return_value = smtp
    smtp_ctx.__exit__.return_value = None

    with patch("services.notification_service.smtplib.SMTP", return_value=smtp_ctx) as smtp_cls:
        assert ns._send_smtp_email("client@test.com", "Subject", "Body") is True

    smtp_cls.assert_called_once_with("smtp.example.com", 587, timeout=10)
    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with("smtp-user", "smtp-pass")
    message = smtp.send_message.call_args.args[0]
    assert message["To"] == "client@test.com"
    assert message["Subject"] == "Subject"
    assert message["From"] == "EZWill Test <noreply@example.com>"


def test_send_smtp_email_returns_false_on_provider_error(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("FROM_EMAIL", "noreply@example.com")
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)

    with patch("services.notification_service.smtplib.SMTP", side_effect=OSError("boom")):
        assert ns._send_smtp_email("client@test.com", "Subject", "Body") is False


@pytest.mark.asyncio
async def test_send_magic_link_smtp_mode_sends_email_not_sms(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_MODE", "smtp")
    ns.NOTIFICATION_MODE = "smtp"
    smtp_send = MagicMock(return_value=True)
    monkeypatch.setattr(ns, "_send_smtp_email", smtp_send)

    result = await ns.send_magic_link_to_client(
        client_email="client@test.com",
        client_phone="+14165550123",
        client_first_name="John",
        client_last_name="Doe",
        magic_link_url="https://ezwill.app/will?t=abc",
        language="en",
    )

    assert result["email_sent"] is True
    assert result["sms_sent"] is False
    smtp_send.assert_called_once()
    assert smtp_send.call_args.args[0] == "client@test.com"
    assert "Your Will Questionnaire" in smtp_send.call_args.args[1]


def test_reminder_preferences_map_to_managed_ghl_tags():
    tags = ns._desired_reminder_tags({
        "email_enabled": True,
        "sms_enabled": True,
        "annual_reminder": True,
        "annual_frequency": "yearly",
        "enabled_life_events": ["marriage", "home-purchase", "unknown"],
        "custom_reminders": [
            {"id": "tax", "label": "Review after tax season", "date": "2027-04-30"}
        ],
    })

    assert tags == [
        ns.GHL_TAGS["CHANNEL_EMAIL"],
        ns.GHL_TAGS["CHANNEL_SMS"],
        ns.GHL_TAGS["REMINDER_ANNUAL"],
        ns.GHL_TAGS["REMINDER_CUSTOM"],
        ns.GHL_TAGS["EVENT_MARRIAGE"],
        ns.GHL_TAGS["EVENT_HOME_PURCHASE"],
    ]


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
    # stdout is a preview sink, not a delivery provider.
    assert result["email_sent"] is False
    assert result["sms_sent"] is False
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
    assert result["email_sent"] is False
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


# ── sync_reminder_preferences_to_ghl ───────────────────────────────

@pytest.mark.asyncio
async def test_sync_reminder_preferences_stdout_calculates_tags(monkeypatch, caplog):
    monkeypatch.setenv("NOTIFICATION_MODE", "stdout")
    ns.NOTIFICATION_MODE = "stdout"

    import logging
    caplog.set_level(logging.INFO)

    result = await ns.sync_reminder_preferences_to_ghl(
        {"first_name": "Jane", "last_name": "Smith", "name": "Jane Smith", "email": "jane@test.com"},
        {
            "email_enabled": True,
            "sms_enabled": False,
            "email": "jane@test.com",
            "annual_reminder": True,
            "annual_frequency": "biannual",
            "enabled_life_events": ["child-birth"],
            "custom_reminders": [
                {"id": "tax", "label": "Review after tax season", "date": "2027-04-30"}
            ],
        },
    )

    assert result["success"] is True
    assert result["ghl_synced"] is False
    assert result["tags_added"] == [
        ns.GHL_TAGS["CHANNEL_EMAIL"],
        ns.GHL_TAGS["REMINDER_BIANNUAL"],
        ns.GHL_TAGS["REMINDER_CUSTOM"],
        ns.GHL_TAGS["EVENT_CHILD_BIRTH"],
    ]
    assert result["custom_tasks"]["desired"] == 1
    assert any("[GHL REMINDER SYNC]" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_sync_reminder_preferences_ghl_replaces_managed_tags(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_MODE", "ghl")
    monkeypatch.setenv("GHL_API_KEY", "test-key")
    monkeypatch.setenv("GHL_LOCATION_ID", "test-location")
    ns.NOTIFICATION_MODE = "ghl"
    monkeypatch.setattr(ns, "_find_or_create_contact", AsyncMock(return_value="contact-123"))

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=MagicMock(
        status_code=200,
        json=lambda: {
            "contact": {
                "tags": [
                    ns.GHL_TAGS["CHANNEL_EMAIL"],
                    ns.GHL_TAGS["REMINDER_BIANNUAL"],
                    ns.GHL_TAGS["EVENT_BUSINESS"],
                ]
            }
        },
    ))
    mock_client.request = AsyncMock(return_value=MagicMock(status_code=204, text=""))
    mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, text="", json=lambda: {"tags": []}))

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_client
    mock_ctx.__aexit__.return_value = None

    with patch("services.notification_service.httpx.AsyncClient", return_value=mock_ctx):
        result = await ns.sync_reminder_preferences_to_ghl(
            {"first_name": "Jane", "last_name": "Smith", "name": "Jane Smith", "email": "jane@test.com"},
            {
                "email_enabled": True,
                "sms_enabled": True,
                "email": "jane@test.com",
                "phone": "+14165550123",
                "annual_reminder": True,
                "annual_frequency": "yearly",
                "enabled_life_events": ["marriage"],
            },
        )

    assert result["success"] is True
    assert result["ghl_synced"] is True
    assert result["contact_id"] == "contact-123"
    assert mock_client.request.call_args.args[0] == "DELETE"
    assert mock_client.request.call_args.kwargs["json"]["tags"] == [
        ns.GHL_TAGS["REMINDER_BIANNUAL"],
        ns.GHL_TAGS["EVENT_BUSINESS"],
    ]
    assert mock_client.post.call_args.kwargs["json"]["tags"] == [
        ns.GHL_TAGS["CHANNEL_SMS"],
        ns.GHL_TAGS["REMINDER_ANNUAL"],
        ns.GHL_TAGS["EVENT_MARRIAGE"],
    ]


@pytest.mark.asyncio
async def test_sync_reminder_preferences_reconciles_custom_tasks(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_MODE", "ghl")
    monkeypatch.setenv("GHL_API_KEY", "test-key")
    monkeypatch.setenv("GHL_LOCATION_ID", "test-location")
    ns.NOTIFICATION_MODE = "ghl"
    monkeypatch.setattr(ns, "_find_or_create_contact", AsyncMock(return_value="contact-123"))

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=[
        MagicMock(status_code=200, json=lambda: {"contact": {"tags": []}}),
        MagicMock(status_code=200, json=lambda: {
            "tasks": [
                {
                    "id": "task-old",
                    "title": "EZWill review reminder: old",
                    "body": f"{ns.CUSTOM_REMINDER_MARKER_PREFIX}old\nDate: 2027-01-01",
                }
            ]
        }),
    ])
    mock_client.request = AsyncMock(return_value=MagicMock(status_code=204, text=""))
    mock_client.delete = AsyncMock(return_value=MagicMock(status_code=200, text=""))
    mock_client.post = AsyncMock(side_effect=[
        MagicMock(status_code=201, text="", json=lambda: {"tags": []}),
        MagicMock(status_code=201, text="", json=lambda: {"task": {"id": "task-tax"}}),
    ])

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_client
    mock_ctx.__aexit__.return_value = None

    with patch("services.notification_service.httpx.AsyncClient", return_value=mock_ctx):
        result = await ns.sync_reminder_preferences_to_ghl(
            {"first_name": "Jane", "last_name": "Smith", "name": "Jane Smith", "email": "jane@test.com"},
            {
                "email_enabled": True,
                "sms_enabled": False,
                "email": "jane@test.com",
                "annual_reminder": False,
                "annual_frequency": "yearly",
                "enabled_life_events": [],
                "custom_reminders": [
                    {
                        "id": "tax",
                        "label": "Review after tax season",
                        "date": "2027-04-30",
                        "recurring": True,
                    }
                ],
            },
        )

    assert result["ghl_synced"] is True
    assert result["tags_added"] == [
        ns.GHL_TAGS["CHANNEL_EMAIL"],
        ns.GHL_TAGS["REMINDER_CUSTOM"],
    ]
    assert result["custom_tasks"]["deleted"] == ["task-old"]
    assert result["custom_tasks"]["created"] == ["task-tax"]
    assert mock_client.delete.call_args.args[0].endswith("/contacts/contact-123/tasks/task-old")
    task_payload = mock_client.post.call_args_list[1].kwargs["json"]
    assert task_payload["title"] == "EZWill review reminder: Review after tax season"
    assert task_payload["dueDate"] == "2027-04-30T14:00:00Z"
    assert f"{ns.CUSTOM_REMINDER_MARKER_PREFIX}tax" in task_payload["body"]


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
    assert result["email_sent"] is False
    assert result["sms_sent"] is False
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
    assert result["sms_sent"] is False


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
    assert result is False
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
