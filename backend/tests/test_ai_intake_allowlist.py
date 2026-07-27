"""AI-chat vault writability tests (issue #82).

The chat mode is supposed to fill the same fields as the guided form. That
broke silently when the nine-section script added list questions the chat
allowlist never learned about: clients described their gifts and attorneys
to the AI, the tool call was rejected, and nothing landed in the vault.

These tests pin (a) the allowlist against the intake script's actual list
paths and (b) nested-path appends, which the old flat implementation turned
into a dead top-level key literally named "assets.items".
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.ai_intake import APPEND_LIST_PATHS, _append_list

SCRIPT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "frontend", "src", "lib", "intake", "will-intake-script.ts",
)


def _script_list_paths() -> set:
    """Extract every list-kind question's vaultPath from the intake script."""
    source = open(SCRIPT_PATH, encoding="utf-8").read()
    paths = set()
    # Question objects carry vaultPath and kind in either order; scan each
    # object-literal-ish region for a list-typed kind.
    for block in re.findall(r"\{[^{}]*vaultPath:\s*'[^']+'[^{}]*\}", source, re.S):
        kind = re.search(r"kind:\s*'(\w+)'", block)
        path = re.search(r"vaultPath:\s*'([^']+)'", block)
        if kind and path and ("List" in kind.group(1) or kind.group(1) == "list"):
            paths.add(path.group(1))
    return paths


def test_allowlist_covers_every_list_question_in_the_intake_script():
    script_paths = _script_list_paths()
    assert script_paths, "extraction regressed — found no list questions at all"
    missing = script_paths - APPEND_LIST_PATHS
    assert not missing, (
        f"AI chat cannot record these intake lists: {sorted(missing)}. "
        "Add them to APPEND_LIST_PATHS in routes/ai_intake.py (and confirm "
        "the tool schema description mentions them)."
    )


def test_append_walks_nested_paths():
    vault: dict = {}
    stored = _append_list(vault, "assets.items", {"description": "House"})
    assert vault["assets"]["items"][0]["description"] == "House"
    assert stored["id"]  # id assigned
    # The flat-key bug: nothing may create a literal "assets.items" key.
    assert "assets.items" not in vault


def test_append_preserves_existing_nested_data():
    vault = {"poa": {"property": {"requested": True, "attorneys": [{"id": "a1", "fullName": "Kim"}]}}}
    _append_list(vault, "poa.property.attorneys", {"fullName": "Lee"})
    assert [a["fullName"] for a in vault["poa"]["property"]["attorneys"]] == ["Kim", "Lee"]
    assert vault["poa"]["property"]["requested"] is True


def test_append_flat_path_still_works():
    vault: dict = {"children": [{"id": "c1", "fullName": "A"}]}
    _append_list(vault, "children", {"fullName": "B"})
    assert len(vault["children"]) == 2
