"""Regression tests for local AI usage metering and dashboard reporting."""

from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, timezone
from types import ModuleType, SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import agents, ai_intake, auth, usage
from services import ai_usage


COUNT_FIELDS = (
    "events",
    "requests",
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "total_tokens",
)


@pytest.fixture
def dashboard_headers():
    token = "usage-dashboard-token"
    auth._active_tokens[token] = 9_999_999_999
    try:
        yield {"Authorization": f"Bearer {token}"}
    finally:
        auth._active_tokens.pop(token, None)


def _usage_client() -> TestClient:
    app = FastAPI()
    app.include_router(usage.router, prefix="/api/usage")
    return TestClient(app)


def _counts(multiplier: int = 1) -> dict[str, str]:
    return {
        "events": str(1 * multiplier),
        "requests": str(2 * multiplier),
        "input_tokens": str(100 * multiplier),
        "output_tokens": str(20 * multiplier),
        "cache_read_input_tokens": str(30 * multiplier),
        "cache_creation_input_tokens": str(5 * multiplier),
        "total_tokens": str(155 * multiplier),
    }


class _UsageReportDb:
    calls: list[tuple] = []

    def __init__(self, schema: str):
        self.schema = schema

    def __enter__(self):
        type(self).calls.append(("enter", self.schema))
        return self

    def __exit__(self, *_exc):
        return None

    def get_ai_usage_totals(self, since=None):
        type(self).calls.append(("totals", since))
        return _counts(2 if since is None else 1)

    def get_ai_usage_by_model(self, since=None):
        type(self).calls.append(("models", since))
        return [{**_counts(), "provider": "openai", "model": "gpt-test"}]

    def get_ai_usage_daily(self, since=None):
        type(self).calls.append(("daily", since))
        return [{**_counts(), "date": date(2026, 7, 12)}]

    def list_ai_usage_events(self, since=None, limit=50):
        type(self).calls.append(("recent", since, limit))
        return [{
            "id": "event-id",
            "draft_id": None,
            "provider": "openai",
            "model": "gpt-test",
            "feature": "quick_draft",
            "request_count": 1,
            "input_tokens": "100",
            "output_tokens": "20",
            "cache_read_input_tokens": "30",
            "cache_creation_input_tokens": "5",
            "total_tokens": "155",
            "latency_ms": 25,
            "created_at": datetime(2026, 7, 12, 15, 30, tzinfo=timezone.utc),
            "client_name": None,
        }]

    def get_ai_usage_tracked_since(self):
        type(self).calls.append(("tracked_since",))
        return datetime(2026, 7, 1, tzinfo=timezone.utc)


def test_usage_route_requires_dashboard_auth(monkeypatch):
    class FailIfOpened:
        def __init__(self, _schema):
            raise AssertionError("database must not be opened before authentication")

    monkeypatch.setattr(usage, "EWDbWriter", FailIfOpened)

    response = _usage_client().get("/api/usage")

    assert response.status_code == 401


def test_usage_route_days_zero_returns_all_time_and_integer_counts(
    monkeypatch, dashboard_headers
):
    _UsageReportDb.calls = []
    monkeypatch.setattr(usage, "EWDbWriter", _UsageReportDb)

    response = _usage_client().get(
        "/api/usage?days=0&limit=7",
        headers=dashboard_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["range"]["days"] == 0
    assert payload["range"]["since"] is None
    tracked_since = datetime.fromisoformat(
        payload["range"]["tracked_since"].replace("Z", "+00:00")
    )
    assert tracked_since == datetime(2026, 7, 1, tzinfo=timezone.utc)
    assert all(isinstance(payload["totals"][field], int) for field in COUNT_FIELDS)
    assert all(isinstance(payload["all_time"][field], int) for field in COUNT_FIELDS)
    assert all(isinstance(payload["by_model"][0][field], int) for field in COUNT_FIELDS)
    assert all(isinstance(payload["daily"][0][field], int) for field in COUNT_FIELDS)
    assert payload["recent"][0]["total_tokens"] == 155
    assert ("recent", None, 7) in _UsageReportDb.calls
    assert [call for call in _UsageReportDb.calls if call[0] == "totals"] == [
        ("totals", None),
    ]


@pytest.mark.parametrize(
    "query",
    [
        "days=-1",
        "days=3651",
        "limit=0",
        "limit=101",
    ],
)
def test_usage_route_rejects_out_of_bounds_queries(
    monkeypatch, dashboard_headers, query
):
    class FailIfOpened:
        def __init__(self, _schema):
            raise AssertionError("database must not be opened for an invalid query")

    monkeypatch.setattr(usage, "EWDbWriter", FailIfOpened)

    response = _usage_client().get(
        f"/api/usage?{query}",
        headers=dashboard_headers,
    )

    assert response.status_code == 422


def test_usage_recorder_retries_without_invalid_draft_attribution(monkeypatch):
    class RetryWithoutDraftDb:
        calls: list[dict] = []

        def __init__(self, schema):
            self.schema = schema

        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return None

        def record_ai_usage(self, **kwargs):
            type(self).calls.append(kwargs)
            if kwargs["draft_id"] is not None:
                raise ValueError("invalid draft id")
            return {"id": "saved-without-draft"}

    monkeypatch.setattr(ai_usage, "EWDbWriter", RetryWithoutDraftDb)
    monkeypatch.setenv("DEFAULT_SCHEMA", "firm_usage_test")

    saved = ai_usage.record_ai_usage_event(
        provider="openai",
        model="gpt-test",
        feature="quick_draft",
        draft_id="not-a-real-draft",
        input_tokens=10,
        metadata={"provider_response_id": "response-id"},
    )

    assert saved is True
    assert len(RetryWithoutDraftDb.calls) == 2
    assert RetryWithoutDraftDb.calls[0]["draft_id"] == "not-a-real-draft"
    assert RetryWithoutDraftDb.calls[1]["draft_id"] is None
    assert RetryWithoutDraftDb.calls[1]["metadata"] == {
        "provider_response_id": "response-id",
        "unattributed_draft_id": "not-a-real-draft",
    }


class _FakeHttpResponse:
    status_code = 200
    text = ""

    def __init__(self, payload: dict):
        self.payload = payload

    def json(self):
        return self.payload


class _FakeAsyncHttpClient:
    def __init__(self, response: _FakeHttpResponse):
        self.response = response
        self.post_kwargs = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return None

    async def post(self, *_args, **kwargs):
        self.post_kwargs = kwargs
        return self.response


def _openai_payload(content: str = '{"needs_dual_will": false}') -> dict:
    return {
        "id": "chatcmpl-test",
        "model": "gpt-4o-2026-01-01",
        "usage": {
            "prompt_tokens": 1_000,
            "completion_tokens": 80,
            "prompt_tokens_details": {"cached_tokens": 250},
        },
        "choices": [{"message": {"content": content}}],
    }


@pytest.mark.asyncio
async def test_openai_usage_splits_cached_prompt_tokens_without_double_counting(
    monkeypatch,
):
    fake_client = _FakeAsyncHttpClient(_FakeHttpResponse(_openai_payload()))
    recorded = []
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(agents.httpx, "AsyncClient", lambda **_kwargs: fake_client)
    monkeypatch.setattr(
        ai_usage,
        "record_ai_usage_event",
        lambda **kwargs: recorded.append(kwargs) or True,
    )

    result = await agents._call_openai_quick_draft(
        "client summary",
        draft_id="draft-id",
        correlation_id="correlation-id",
    )

    assert result == {"needs_dual_will": False}
    assert len(recorded) == 1
    assert recorded[0] == {
        "provider": "openai",
        "model": "gpt-4o-2026-01-01",
        "feature": "quick_draft",
        "draft_id": "draft-id",
        "request_count": 1,
        "input_tokens": 750,
        "output_tokens": 80,
        "cache_read_input_tokens": 250,
        "latency_ms": recorded[0]["latency_ms"],
        "correlation_id": "correlation-id",
        "metadata": {"provider_response_id": "chatcmpl-test"},
    }
    assert recorded[0]["latency_ms"] >= 0


@pytest.mark.asyncio
async def test_openai_usage_is_recorded_before_malformed_content_parse(monkeypatch):
    fake_client = _FakeAsyncHttpClient(
        _FakeHttpResponse(_openai_payload(content="not valid JSON"))
    )
    recorded = []
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(agents.httpx, "AsyncClient", lambda **_kwargs: fake_client)
    monkeypatch.setattr(
        ai_usage,
        "record_ai_usage_event",
        lambda **kwargs: recorded.append(kwargs) or True,
    )

    with pytest.raises(json.JSONDecodeError):
        await agents._call_openai_quick_draft("client summary")

    assert len(recorded) == 1
    assert recorded[0]["input_tokens"] == 750
    assert recorded[0]["cache_read_input_tokens"] == 250


class _FakeClaudeStream:
    def __init__(self, final_or_error):
        self.final_or_error = final_or_error

    async def __aenter__(self):
        if isinstance(self.final_or_error, BaseException):
            raise self.final_or_error
        return self

    async def __aexit__(self, *_exc):
        return None

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration

    async def get_final_message(self):
        return self.final_or_error


class _FakeClaudeMessages:
    def __init__(self, finals):
        self.finals = list(finals)
        self.calls = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeClaudeStream(self.finals.pop(0))


class _FakeClaudeClient:
    def __init__(self, finals):
        self.messages = _FakeClaudeMessages(finals)


def _claude_final(*, usage_values: tuple[int, int, int, int], tool_use=None):
    input_tokens, output_tokens, cache_read, cache_creation = usage_values
    content = [tool_use] if tool_use is not None else [SimpleNamespace(type="text")]
    return SimpleNamespace(
        content=content,
        usage=SimpleNamespace(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_input_tokens=cache_read,
            cache_creation_input_tokens=cache_creation,
        ),
    )


@pytest.mark.asyncio
async def test_claude_usage_aggregates_iterations_and_persists_before_done(monkeypatch):
    tool_use = SimpleNamespace(
        type="tool_use",
        id="tool-1",
        name="write_vault_field",
        input={"path": "testator.fullName", "value": "Jane Doe"},
    )
    fake_client = _FakeClaudeClient([
        _claude_final(usage_values=(100, 20, 10, 5), tool_use=tool_use),
        _claude_final(usage_values=(200, 30, 40, 15)),
    ])
    timeline = []
    anthropic = ModuleType("anthropic")
    anthropic.AsyncAnthropic = lambda **_kwargs: fake_client
    monkeypatch.setitem(sys.modules, "anthropic", anthropic)
    monkeypatch.setattr(
        ai_usage,
        "record_ai_usage_event",
        lambda **kwargs: timeline.append(("persist", kwargs)) or True,
    )

    frames = []
    async for frame in ai_intake._stream_with_claude(
        {},
        [ai_intake.ChatMessage(role="user", content="hello")],
        "",
        draft_id="draft-id",
    ):
        decoded = frame.decode()
        frames.append(decoded)
        timeline.append(("frame", decoded))

    persisted = [value for kind, value in timeline if kind == "persist"]
    assert len(persisted) == 1
    assert persisted[0]["request_count"] == 2
    assert persisted[0]["input_tokens"] == 300
    assert persisted[0]["output_tokens"] == 50
    assert persisted[0]["cache_read_input_tokens"] == 50
    assert persisted[0]["cache_creation_input_tokens"] == 20
    assert persisted[0]["metadata"] == {"tool_calls": 1}
    assert sum("event: done" in frame for frame in frames) == 1

    persist_index = next(i for i, item in enumerate(timeline) if item[0] == "persist")
    done_index = next(
        i for i, item in enumerate(timeline)
        if item[0] == "frame" and "event: done" in item[1]
    )
    assert persist_index < done_index


@pytest.mark.asyncio
async def test_claude_partial_failure_persists_completed_usage_once(monkeypatch):
    tool_use = SimpleNamespace(
        type="tool_use",
        id="tool-1",
        name="write_vault_field",
        input={"path": "testator.fullName", "value": "Jane Doe"},
    )
    fake_client = _FakeClaudeClient([
        _claude_final(usage_values=(100, 20, 10, 5), tool_use=tool_use),
        RuntimeError("second provider iteration failed"),
    ])
    recorded = []
    anthropic = ModuleType("anthropic")
    anthropic.AsyncAnthropic = lambda **_kwargs: fake_client
    monkeypatch.setitem(sys.modules, "anthropic", anthropic)
    monkeypatch.setattr(
        ai_usage,
        "record_ai_usage_event",
        lambda **kwargs: recorded.append(kwargs) or True,
    )

    with pytest.raises(RuntimeError, match="second provider iteration failed"):
        async for _frame in ai_intake._stream_with_claude(
            {},
            [ai_intake.ChatMessage(role="user", content="hello")],
            "",
            draft_id="draft-id",
        ):
            pass

    assert len(recorded) == 1
    assert recorded[0]["request_count"] == 1
    assert recorded[0]["input_tokens"] == 100
    assert recorded[0]["output_tokens"] == 20
