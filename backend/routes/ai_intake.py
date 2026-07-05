"""
Conversational intake route — SSE streaming with Claude tool-use.

Design:
- Client POSTs the full conversation history + current vault snapshot.
- Server runs a tool-use loop against the Anthropic SDK (max 5 iterations per
  user turn). On each tool call the server stages vault writes against an
  in-memory copy, emits the patch to the client, feeds a tool_result back to
  Claude, and continues until Claude emits stop_reason=end_turn.
- Client is the source of truth for the vault. Patches stream as SSE events
  so the UI can update the Zustand store in real time; if the user navigates
  away mid-stream the patches applied so far survive.
- If ANTHROPIC_API_KEY is unset or the SDK call raises, the route falls back
  to a deterministic regex extractor so the UI flow stays intact offline.

SSE frames emitted:
  event: text_delta   data: {"text": "..."}
  event: tool_call    data: {"id": "...", "name": "write_vault_field", "input": {...}}
  event: vault_patch  data: {"path": "testator.fullName", "value": "Jane Doe"}
  event: advance      data: {"chapter_id": "family"}
  event: clarify      data: {"question": "Which of your children are minors?"}
  event: error        data: {"message": "..."}
  event: done         data: {"tool_calls": 3, "elapsed_ms": 842, "source": "claude"|"mock"}
"""

from __future__ import annotations

import json
import os
import re
import time
import logging
from collections import deque
from threading import Lock
from typing import Any, AsyncIterator, Optional, Deque

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from routes.auth import assert_auth_context_can_access_draft, verify_client_or_dashboard_access

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Config ──────────────────────────────────────────────────────────────────
# Anthropic credentials + model override. ANTHROPIC_INTAKE_MODEL lets ops
# switch to Haiku for ~5-10x cost reduction without a code change.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = os.getenv("ANTHROPIC_INTAKE_MODEL", "claude-sonnet-4-5")
MAX_TOOL_ITERATIONS = 5
MAX_OUTPUT_TOKENS = 1024

# Per-draft sliding-window rate limiter. Env-tunable so we can tighten in
# prod without a redeploy. In-process dict + threading.Lock — fine for a
# single-worker uvicorn; swap to Redis for multi-worker deployments.
RATE_LIMIT_WINDOW_SECS = int(os.getenv("AI_INTAKE_RATE_WINDOW_SECS", "60"))
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("AI_INTAKE_RATE_MAX_REQS", "20"))
_rate_hits: dict[str, Deque[float]] = {}
_rate_lock = Lock()


def _check_rate_limit(draft_id: str) -> None:
    """Raise HTTPException 429 if the draft exceeded its window quota.

    Sliding window: drop timestamps older than WINDOW_SECS, then count.
    """
    now = time.time()
    cutoff = now - RATE_LIMIT_WINDOW_SECS
    with _rate_lock:
        hits = _rate_hits.setdefault(draft_id, deque())
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= RATE_LIMIT_MAX_REQUESTS:
            retry_after = max(1, int(hits[0] + RATE_LIMIT_WINDOW_SECS - now))
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: {RATE_LIMIT_MAX_REQUESTS} requests per {RATE_LIMIT_WINDOW_SECS}s",
                headers={"Retry-After": str(retry_after)},
            )
        hits.append(now)


# ── Request / response models ───────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class IntakeChatRequest(BaseModel):
    draft_id: str
    messages: list[ChatMessage]
    vault: dict[str, Any] = Field(default_factory=dict)
    progress_summary: Optional[str] = None  # client-side progress breakdown


# ── Tool schemas (Anthropic tool-use format) ────────────────────────────────
TOOLS = [
    {
        "name": "write_vault_field",
        "description": (
            "Write a single scalar value into the user's will vault at a "
            "dot-path (e.g. 'testator.fullName', 'spouse.fullName', "
            "'goals.hasDualWill'). Use this for strings, numbers, booleans, "
            "and enums. Never invent values — only write what the user has "
            "actually stated. If a field already has a value, do NOT overwrite "
            "it unless the user explicitly corrected it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Dot-path into the vault (e.g. 'testator.fullName').",
                },
                "value": {
                    "description": "String, number, or boolean. Dates must be ISO-8601 (YYYY-MM-DD).",
                },
            },
            "required": ["path", "value"],
        },
    },
    {
        "name": "append_vault_list_item",
        "description": (
            "Append an item to a list field in the vault (children, executors, "
            "guardians, beneficiaries). The item should be a small object with "
            "at minimum a fullName. Use crypto-style unique ids if possible; "
            "otherwise omit id and the server will generate one."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "list_path": {
                    "type": "string",
                    "description": "One of: 'children', 'executors', 'guardians', 'beneficiaries'.",
                },
                "item": {
                    "type": "object",
                    "description": "Object with fullName and optional dob, relationship, isBackup, fromPriorRelationship, sharePercent.",
                },
            },
            "required": ["list_path", "item"],
        },
    },
    {
        "name": "advance_chapter",
        "description": (
            "Signal the UI to focus the given chapter next. Use after finishing "
            "one topic and before starting another. Does not modify the vault."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "chapter_id": {
                    "type": "string",
                    "enum": ["testator", "family", "executors", "beneficiaries", "assets", "special"],
                },
            },
            "required": ["chapter_id"],
        },
    },
    {
        "name": "ask_clarifying_question",
        "description": (
            "Pause to ask a clarifying question when the user's input is "
            "ambiguous. Does not modify the vault."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
            },
            "required": ["question"],
        },
    },
]


SYSTEM_PROMPT_TEMPLATE = """You are an intake assistant for an Ontario estate-planning app called EZWill.
Your job is to help the user fill out their will vault by asking natural, warm questions and calling tools
to record their answers. Be concise. One or two short questions at a time. Never draft legal advice.

The vault has these chapters:
1. testator (fullName, dob, address, maritalStatus, occupation, citizenship)
2. family (spouse.fullName, spouse.included, children[])
3. executors (executors[], guardians[] — each with fullName, relationship, isBackup)
4. beneficiaries (beneficiaries[] with fullName, relationship, sharePercent, specificGift; goals.charitableGiving)
5. assets (assets.estimatedNetWorth, assets.privateCompanyShares, assets.realEstate, assets.lifeInsurance, goals.hasDualWill)
6. special (goals.henson, goals.minorChildrenTrust, goals.hasPoaProperty, goals.hasPoaPersonalCare)

Rules:
- NEVER invent values. If the user hasn't told you something, don't write it.
- If a field already has a value in the vault, don't overwrite it unless the user says to correct it.
- Use write_vault_field for scalars. Use append_vault_list_item for children/executors/guardians/beneficiaries.
- When you've finished a chapter (all required fields filled), call advance_chapter and move on.
- When the user's message is ambiguous, call ask_clarifying_question rather than guessing.
- Keep assistant messages short (1–2 sentences) unless the user asks for more.

Current vault state (already filled):
{vault_json}

Progress:
{progress_summary}
"""


def _sse(event: str, data: dict) -> bytes:
    """Encode a single SSE frame."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


def _apply_patch(vault: dict, path: str, value: Any) -> None:
    """Walk dot-path and set value, creating intermediate objects."""
    parts = path.split(".")
    cursor = vault
    for key in parts[:-1]:
        if key not in cursor or not isinstance(cursor[key], dict):
            cursor[key] = {}
        cursor = cursor[key]
    cursor[parts[-1]] = value


def _append_list(vault: dict, list_path: str, item: dict) -> dict:
    """Ensure vault[list_path] is a list and append. Assigns id if missing."""
    if list_path not in vault or not isinstance(vault[list_path], list):
        vault[list_path] = []
    if "id" not in item:
        import uuid
        item["id"] = str(uuid.uuid4())
    vault[list_path].append(item)
    return item


# ── Anthropic streaming path ────────────────────────────────────────────────
async def _stream_with_claude(
    vault: dict, messages: list[ChatMessage], progress_summary: str
) -> AsyncIterator[bytes]:
    """Drive the Anthropic tool-use loop, yielding SSE frames as events occur."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    # Build conversation for the SDK. Claude wants a list of {role, content}
    # where content for assistant turns that involved tool use is a list of
    # blocks. For simplicity we pass only text here; the loop manages
    # tool_use / tool_result blocks internally.
    conversation: list[dict[str, Any]] = []
    for m in messages:
        conversation.append({"role": m.role, "content": m.content})

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        vault_json=json.dumps(vault, ensure_ascii=False, indent=2),
        progress_summary=progress_summary or "(no progress summary)",
    )

    started = time.time()
    tool_call_count = 0
    # Accumulate token usage across every iteration of the tool-use loop so
    # the final `done` event reports totals for the whole user turn, not
    # just the last Claude response.
    total_input_tokens = 0
    total_output_tokens = 0
    total_cache_read = 0
    total_cache_creation = 0

    for iteration in range(MAX_TOOL_ITERATIONS):
        # Stream the assistant response. We use the streaming API so the UI
        # can render text deltas as they arrive; tool_use blocks come through
        # as structured events which we buffer until content_block_stop.
        async with client.messages.stream(
            model=MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=system_prompt,
            tools=TOOLS,
            messages=conversation,
        ) as stream:
            async for event in stream:
                etype = getattr(event, "type", None)
                if etype == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    if delta and getattr(delta, "type", None) == "text_delta":
                        yield _sse("text_delta", {"text": delta.text})
                # tool_use blocks are assembled at content_block_stop; handled
                # below via the final_message we pull after streaming ends.

            final = await stream.get_final_message()

        # Accumulate token usage from this iteration. `usage` is always
        # present on a non-streaming-error response; read defensively so
        # SDK schema drift doesn't crash the route.
        usage = getattr(final, "usage", None)
        if usage is not None:
            total_input_tokens += int(getattr(usage, "input_tokens", 0) or 0)
            total_output_tokens += int(getattr(usage, "output_tokens", 0) or 0)
            total_cache_read += int(getattr(usage, "cache_read_input_tokens", 0) or 0)
            total_cache_creation += int(getattr(usage, "cache_creation_input_tokens", 0) or 0)

        # Record the assistant turn verbatim so the next iteration has full
        # context (tool_use ids must be referenced in the tool_result).
        conversation.append({"role": "assistant", "content": final.content})

        # Collect tool uses from the final message.
        tool_uses = [b for b in final.content if getattr(b, "type", None) == "tool_use"]
        if not tool_uses:
            # No tools requested — the assistant is done talking.
            break

        # Execute each tool, emit SSE, and build tool_result blocks.
        tool_results: list[dict[str, Any]] = []
        for tu in tool_uses:
            tool_call_count += 1
            name = tu.name
            tool_input = tu.input or {}
            yield _sse(
                "tool_call",
                {"id": tu.id, "name": name, "input": tool_input},
            )
            result_payload = _execute_tool(name, tool_input, vault)
            # Emit any client-visible side effect.
            async for frame in _frames_for_side_effect(name, tool_input, result_payload):
                yield frame
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(result_payload, ensure_ascii=False),
                }
            )

        # Feed the tool_results back into the conversation and loop.
        conversation.append({"role": "user", "content": tool_results})

    elapsed_ms = int((time.time() - started) * 1000)
    # Structured billing log — parse-friendly for log aggregators.
    logger.info(
        "ai_intake.claude.usage model=%s input=%d output=%d cache_read=%d cache_creation=%d tool_calls=%d elapsed_ms=%d",
        MODEL,
        total_input_tokens,
        total_output_tokens,
        total_cache_read,
        total_cache_creation,
        tool_call_count,
        elapsed_ms,
    )
    yield _sse(
        "done",
        {
            "tool_calls": tool_call_count,
            "elapsed_ms": elapsed_ms,
            "source": "claude",
            "model": MODEL,
            "usage": {
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "cache_read_input_tokens": total_cache_read,
                "cache_creation_input_tokens": total_cache_creation,
            },
        },
    )


async def _frames_for_side_effect(
    name: str, tool_input: dict, result: dict
) -> AsyncIterator[bytes]:
    """Translate a server-side tool execution into client-visible SSE frames."""
    if name == "write_vault_field" and result.get("ok"):
        yield _sse(
            "vault_patch",
            {"path": tool_input.get("path"), "value": tool_input.get("value")},
        )
    elif name == "append_vault_list_item" and result.get("ok"):
        yield _sse(
            "vault_patch",
            {
                "list_path": tool_input.get("list_path"),
                "item": result.get("item"),
                "op": "append",
            },
        )
    elif name == "advance_chapter":
        yield _sse("advance", {"chapter_id": tool_input.get("chapter_id")})
    elif name == "ask_clarifying_question":
        yield _sse("clarify", {"question": tool_input.get("question")})


def _execute_tool(name: str, tool_input: dict, vault: dict) -> dict:
    """Run the tool against the staging vault and return a structured result."""
    try:
        if name == "write_vault_field":
            path = tool_input["path"]
            value = tool_input["value"]
            _apply_patch(vault, path, value)
            return {"ok": True}
        if name == "append_vault_list_item":
            list_path = tool_input["list_path"]
            item = dict(tool_input.get("item") or {})
            if list_path not in {"children", "executors", "guardians", "beneficiaries"}:
                return {"ok": False, "error": f"unsupported list_path {list_path}"}
            stored = _append_list(vault, list_path, item)
            return {"ok": True, "item": stored}
        if name in {"advance_chapter", "ask_clarifying_question"}:
            return {"ok": True}
        return {"ok": False, "error": f"unknown tool {name}"}
    except Exception as exc:  # noqa: BLE001 — we want to surface to the model
        logger.exception("tool execution failed")
        return {"ok": False, "error": str(exc)}


# ── Mock / offline path ─────────────────────────────────────────────────────
_NAME_RE = re.compile(r"(?:i(?:'| a)m|my name is|i am)\s+([A-Z][a-zA-Z\- ]{1,40})", re.IGNORECASE)
_SPOUSE_RE = re.compile(r"(?:married to|my (?:wife|husband|spouse|partner) is)\s+([A-Z][a-zA-Z\- ]{1,40})", re.IGNORECASE)
_CHILDREN_RE = re.compile(r"(?:children(?: are)?|kids(?: are)?|two kids|three kids)\s*[:,]?\s*([A-Z][A-Za-z,\- and]+)", re.IGNORECASE)
_YESNO_RE = {
    "hasDualWill": re.compile(r"\b(dual will|two wills|secondary will)\b", re.IGNORECASE),
    "hasPoaProperty": re.compile(r"\b(poa (?:for )?property|power of attorney for property)\b", re.IGNORECASE),
    "hasPoaPersonalCare": re.compile(r"\b(personal care poa|poa (?:for )?personal care)\b", re.IGNORECASE),
    "privateCompanyShares": re.compile(r"\b(private (?:company|corp|corporation) shares?|private-co)\b", re.IGNORECASE),
}


async def _stream_with_mock(
    vault: dict, messages: list[ChatMessage], progress_summary: str
) -> AsyncIterator[bytes]:
    """Deterministic extractor used when Claude isn't available."""
    started = time.time()
    tool_count = 0

    # Work on the last user message.
    last_user = next((m for m in reversed(messages) if m.role == "user"), None)
    if not last_user:
        yield _sse("text_delta", {"text": "Tell me about yourself to get started."})
        yield _sse("done", {"tool_calls": 0, "elapsed_ms": 1, "source": "mock"})
        return

    text = last_user.content

    # Acknowledge first so the user sees something.
    yield _sse("text_delta", {"text": "Got it — extracting what I can. "})

    patches: list[tuple[str, str, Any]] = []  # (name, path_or_list, value_or_item)

    m = _NAME_RE.search(text)
    if m and not vault.get("testator", {}).get("fullName"):
        patches.append(("write_vault_field", "testator.fullName", m.group(1).strip()))

    m = _SPOUSE_RE.search(text)
    if m:
        patches.append(("write_vault_field", "spouse.included", True))
        patches.append(("write_vault_field", "spouse.fullName", m.group(1).strip()))

    m = _CHILDREN_RE.search(text)
    if m:
        raw = m.group(1)
        # Split on commas / "and" / whitespace of 2+ capitalised names.
        names = [p.strip() for p in re.split(r",|\band\b", raw) if p.strip()]
        for n in names:
            if re.match(r"^[A-Z][A-Za-z\- ]{1,40}$", n):
                patches.append(("append_vault_list_item", "children", {"fullName": n}))

    for field, rex in _YESNO_RE.items():
        if rex.search(text):
            path = (
                f"assets.{field}"
                if field == "privateCompanyShares"
                else f"goals.{field}"
            )
            patches.append(("write_vault_field", path, True))

    for name, path_or_list, payload in patches:
        tool_count += 1
        if name == "write_vault_field":
            yield _sse("tool_call", {"id": f"mock-{tool_count}", "name": name, "input": {"path": path_or_list, "value": payload}})
            _apply_patch(vault, path_or_list, payload)
            yield _sse("vault_patch", {"path": path_or_list, "value": payload})
        else:
            yield _sse("tool_call", {"id": f"mock-{tool_count}", "name": name, "input": {"list_path": path_or_list, "item": payload}})
            stored = _append_list(vault, path_or_list, payload)
            yield _sse("vault_patch", {"list_path": path_or_list, "item": stored, "op": "append"})

    if not patches:
        yield _sse(
            "text_delta",
            {"text": "I couldn't parse anything concrete from that. Try something like: \"I'm Jane Doe, married to Alex, two kids Sam and Riley.\""},
        )
    else:
        yield _sse(
            "text_delta",
            {"text": f"Recorded {len(patches)} item{'s' if len(patches) != 1 else ''}. What's next?"},
        )

    elapsed_ms = int((time.time() - started) * 1000)
    yield _sse("done", {"tool_calls": tool_count, "elapsed_ms": elapsed_ms, "source": "mock"})


def _persist_vault_snapshot(draft_id: str, vault: dict) -> None:
    """Save the client's vault snapshot onto the draft so the document
    generator can read it. Best-effort: intake chat must not fail if the draft
    doesn't exist yet or the DB write errors."""
    if not vault:
        return
    try:
        import os
        import json as _json
        from services.db import EWDbWriter

        schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
        with EWDbWriter(schema) as db:
            db.update_draft(draft_id, {"vault": _json.dumps(vault)})
    except Exception:  # noqa: BLE001 — never break the chat on persistence
        logger.exception("failed to persist intake vault for draft %s", draft_id)


# ── Route ───────────────────────────────────────────────────────────────────
@router.post("/chat")
async def intake_chat(
    body: IntakeChatRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
    x_magic_token: Optional[str] = Header(None),
):
    """
    SSE stream of assistant text deltas + tool calls + vault patches for
    conversational intake. Falls back to a regex extractor when Claude is
    unavailable so the UI remains usable offline.
    """
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages is required")

    ctx = verify_client_or_dashboard_access(request, authorization, x_magic_token)
    assert_auth_context_can_access_draft(ctx, body.draft_id)

    # Rate limit per draft to prevent runaway costs if a client loops or a
    # token leaks. Raises 429 — frontend already surfaces errors inline.
    _check_rate_limit(body.draft_id)

    # Persist the latest vault snapshot so conversational-intake data reaches
    # the document generator (best-effort; never break the chat on a DB error).
    _persist_vault_snapshot(body.draft_id, body.vault)

    vault = dict(body.vault or {})  # shallow copy we mutate while streaming

    async def generator() -> AsyncIterator[bytes]:
        use_claude = bool(ANTHROPIC_API_KEY)
        if use_claude:
            try:
                async for frame in _stream_with_claude(
                    vault, body.messages, body.progress_summary or ""
                ):
                    yield frame
                return
            except Exception as exc:  # noqa: BLE001 — degrade to mock
                logger.exception("claude intake stream failed; falling back to mock")
                yield _sse("error", {"message": f"Claude error: {exc}. Falling back to pattern matcher."})
        # Fallback path.
        async for frame in _stream_with_mock(vault, body.messages, body.progress_summary or ""):
            yield frame

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering if deployed behind one
            "Connection": "keep-alive",
        },
    )
