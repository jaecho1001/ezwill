from datetime import datetime, timezone

from services.db import EWDbWriter


def test_create_draft_persists_province(monkeypatch):
    writer = EWDbWriter("firm_test")
    captured = {}

    def fake_fetchone(query, params=None):
        captured["query"] = query
        captured["params"] = params
        return {"province": params[-1]}

    monkeypatch.setattr(writer, "fetchone", fake_fetchone)
    result = writer.create_draft("Ada", "Lovelace", language="en", province="BC")

    assert "province" in captured["query"]
    assert captured["params"][-1] == "BC"
    assert result["province"] == "BC"


def test_count_drafts_uses_filtered_database_count(monkeypatch):
    writer = EWDbWriter("firm_test")
    captured = {}

    def fake_fetchone(query, params=None):
        captured["query"] = query
        captured["params"] = params
        return {"total": 137}

    monkeypatch.setattr(writer, "fetchone", fake_fetchone)

    assert writer.count_drafts(status="submitted") == 137
    assert "COUNT(*)" in captured["query"]
    assert captured["params"] == ("submitted",)


def test_count_drafts_without_filter(monkeypatch):
    writer = EWDbWriter("firm_test")
    monkeypatch.setattr(writer, "fetchone", lambda query, params=None: {"total": 251})

    assert writer.count_drafts() == 251


def test_record_ai_usage_normalizes_counts_and_parameterizes_insert(monkeypatch):
    writer = EWDbWriter("firm_test")
    captured = {}

    def fake_fetchone(query, params=None):
        captured["query"] = query
        captured["params"] = params
        return {"id": "usage-event"}

    monkeypatch.setattr(writer, "fetchone", fake_fetchone)

    result = writer.record_ai_usage(
        provider="openai",
        model="gpt-test",
        feature="quick_draft",
        draft_id="draft-id",
        request_count=0,
        input_tokens=-12,
        output_tokens="7",
        cache_read_input_tokens=-4,
        cache_creation_input_tokens=None,
        latency_ms=-25,
        correlation_id="correlation-id",
        metadata={"provider_response_id": "response-id"},
    )

    assert result == {"id": "usage-event"}
    assert "INSERT INTO ew_ai_usage_events" in captured["query"]
    assert captured["query"].count("%s") == 12
    assert captured["params"][:11] == (
        "draft-id",
        "openai",
        "gpt-test",
        "quick_draft",
        1,
        0,
        7,
        0,
        0,
        0,
        "correlation-id",
    )
    assert captured["params"][11].adapted == {
        "provider_response_id": "response-id"
    }


def test_ai_usage_totals_query_supports_filtered_and_all_time_reads(monkeypatch):
    writer = EWDbWriter("firm_test")
    calls = []

    def fake_fetchone(query, params=None):
        calls.append((query, params))
        return {"events": 0, "total_tokens": 0}

    monkeypatch.setattr(writer, "fetchone", fake_fetchone)
    since = datetime(2026, 7, 1, tzinfo=timezone.utc)

    assert writer.get_ai_usage_totals(since) == {"events": 0, "total_tokens": 0}
    assert writer.get_ai_usage_totals() == {"events": 0, "total_tokens": 0}

    filtered_query, filtered_params = calls[0]
    assert "WHERE created_at >= %s" in filtered_query
    assert filtered_params == (since,)
    assert "cache_read_input_tokens" in filtered_query
    assert "cache_creation_input_tokens" in filtered_query
    assert "AS total_tokens" in filtered_query

    all_time_query, all_time_params = calls[1]
    assert "WHERE created_at >= %s" not in all_time_query
    assert all_time_params is None


def test_ai_usage_recent_query_keeps_since_and_limit_parameterized(monkeypatch):
    writer = EWDbWriter("firm_test")
    captured = {}

    def fake_fetchall(query, params=None):
        captured["query"] = query
        captured["params"] = params
        return []

    monkeypatch.setattr(writer, "fetchall", fake_fetchall)
    since = datetime(2026, 7, 1, tzinfo=timezone.utc)

    assert writer.list_ai_usage_events(since, limit=17) == []
    assert "WHERE u.created_at >= %s" in captured["query"]
    assert "LIMIT %s" in captured["query"]
    assert captured["params"] == (since, 17)
