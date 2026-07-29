"""The email fail-loud startup gate (#88).

NOTIFICATION_MODE=stdout logs-and-discards client email. In a
production-shaped environment (secure cookies) with NOTIFICATION_STRICT
set, the app must REFUSE to boot rather than silently no-op every
"send link to client" a lawyer performs.
"""

import importlib

import pytest
from fastapi.testclient import TestClient

from services import db as dbmod


def _boot(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_MODE", "stdout")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "true")
    import main
    importlib.reload(main)
    return main


def test_strict_mode_refuses_to_boot_with_discarded_email(monkeypatch):
    monkeypatch.setenv("NOTIFICATION_STRICT", "true")
    main = _boot(monkeypatch)
    try:
        with pytest.raises(RuntimeError, match="LOGGED AND DISCARDED"):
            with TestClient(main.app):
                pass
    finally:
        # The lifespan shutdown CLOSED the shared pool; leaving the dead
        # object in place errors every later real-DB test module.
        dbmod._pool = None


def test_strict_smtp_refuses_placeholder_from_email(monkeypatch):
    """Codex re-review: SMTP with the placeholder From address fails just
    as silently — the provider refuses senders outside the verified
    domain, so the boot gate must catch it too."""
    monkeypatch.setenv("NOTIFICATION_MODE", "smtp")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "true")
    monkeypatch.setenv("NOTIFICATION_STRICT", "true")
    monkeypatch.setenv("FROM_EMAIL", "noreply@ezwill.app")
    import main
    importlib.reload(main)
    try:
        with pytest.raises(RuntimeError, match="FROM_EMAIL"):
            with TestClient(main.app):
                pass
    finally:
        dbmod._pool = None

    # A firm-domain sender boots cleanly.
    monkeypatch.setenv("FROM_EMAIL", "noreply@vclawyers.ca")
    importlib.reload(main)
    try:
        with TestClient(main.app):
            pass
    finally:
        dbmod._pool = None


def test_non_strict_mode_boots_with_critical_log(monkeypatch, caplog):
    monkeypatch.delenv("NOTIFICATION_STRICT", raising=False)
    main = _boot(monkeypatch)
    try:
        with caplog.at_level("CRITICAL"):
            with TestClient(main.app):
                pass
    finally:
        dbmod._pool = None
    assert any("LOGGED AND DISCARDED" in r.message for r in caplog.records)
