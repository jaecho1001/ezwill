"""Adversarial matcher tests for the shared instruction guard.

Each test here pins a fail-open the second audit round confirmed: cases
where a will contradicting or omitting the client's recorded residue
instructions would still have been delivered. Fail-open is the dangerous
direction for a legal product — these must 422, never deliver.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.instruction_guard import (
    RESIDUE_INSTRUCTION_GAP,
    semantic_instruction_gaps,
)


def _clause(text: str) -> list[dict]:
    return [{
        "clause_id": "res-custom",
        "included": True,
        "custom_text": text,
        "templateText": text,
    }]


def _draft(beneficiaries: list[dict], mode: str = "percentages", **extra) -> dict:
    return {
        "vault": {
            "beneficiaries": beneficiaries,
            "residueDistribution": mode,
        },
        **extra,
    }


# ── name boundaries ──────────────────────────────────────────────────────────

def test_substring_name_does_not_satisfy_a_missing_beneficiary():
    # 'Ann Park' omitted entirely; 'Annette Park' contains 'Ann' but is a
    # different person. Substring matching delivered this will.
    draft = _draft([
        {"fullName": "Annette Park", "sharePercent": 60},
        {"fullName": "Ann Park", "sharePercent": 40},
    ])
    text = "I give 60% of the residue to Annette Park and 40% to Annette Park."
    gaps = semantic_instruction_gaps(draft, "single_will", _clause(text))
    assert RESIDUE_INSTRUCTION_GAP in gaps


def test_exact_names_with_correct_shares_pass():
    draft = _draft([
        {"fullName": "Annette Park", "sharePercent": 60},
        {"fullName": "Ann Park", "sharePercent": 40},
    ])
    text = "I give 60% of the residue to Annette Park and 40% to Ann Park."
    gaps = semantic_instruction_gaps(draft, "single_will", _clause(text))
    assert RESIDUE_INSTRUCTION_GAP not in gaps


# ── digit boundaries ─────────────────────────────────────────────────────────

def test_share_five_is_not_satisfied_by_fifteen_percent():
    # Recorded 5/95; drafted 15/95. '5%' as a substring of '15%' passed.
    draft = _draft([
        {"fullName": "Alex Kim", "sharePercent": 15},
        {"fullName": "Bob Lee", "sharePercent": 95},
    ])
    # Recorded shares are 5 and 95:
    draft["vault"]["beneficiaries"] = [
        {"fullName": "Alex Kim", "sharePercent": 5},
        {"fullName": "Bob Lee", "sharePercent": 95},
    ]
    text = "I give 15% to Alex Kim and 95% to Bob Lee."
    gaps = semantic_instruction_gaps(draft, "single_will", _clause(text))
    assert RESIDUE_INSTRUCTION_GAP in gaps


# ── sentence boundaries ──────────────────────────────────────────────────────

def test_percentage_cannot_claim_a_name_across_a_sentence_boundary():
    # 60% sits in one sentence, Alex Kim in the next; the old 120-char window
    # associated them anyway.
    draft = _draft([{"fullName": "Alex Kim", "sharePercent": 60}])
    text = (
        "I direct that 60% be held on the trusts set out below. "
        "The trustee shall consult Alex Kim about arrangements."
    )
    gaps = semantic_instruction_gaps(draft, "single_will", _clause(text))
    assert RESIDUE_INSTRUCTION_GAP in gaps


# ── hybrid drafts (vault mode set, beneficiaries only in legacy data) ────────

def test_hybrid_draft_falls_back_to_legacy_beneficiaries():
    # A unified-intake autosave can store residueDistribution on the vault of
    # a draft whose beneficiaries still live in your_estate. Keying the
    # source-selection on the mode alone left those beneficiaries ungated.
    draft = {
        "vault": {"residueDistribution": "percentages", "beneficiaries": []},
        "your_estate": {
            "beneficiaries": [
                {"firstName": "Grace", "lastName": "Lee", "percentage": 60},
                {"firstName": "Min", "lastName": "Cho", "percentage": 40},
            ],
            "residueDistribution": "custom",
        },
    }
    text = "I give the residue of my estate to my spouse."
    gaps = semantic_instruction_gaps(draft, "single_will", _clause(text))
    assert RESIDUE_INSTRUCTION_GAP in gaps


# ── shares recorded under a non-percentage mode ─────────────────────────────

def test_recorded_shares_are_checked_even_without_percentage_mode():
    # Legacy rows can carry percentages with no (or another) recorded mode;
    # previously the share check simply never ran for them.
    draft = {
        "vault": {},
        "people": [
            {"role": "beneficiary", "first_name": "Grace", "last_name": "Lee",
             "percentage": 70},
            {"role": "beneficiary", "first_name": "Min", "last_name": "Cho",
             "percentage": 30},
        ],
    }
    text = "I give 30% to Grace Lee and 70% to Min Cho."  # swapped
    gaps = semantic_instruction_gaps(draft, "single_will", _clause(text))
    assert RESIDUE_INSTRUCTION_GAP in gaps


def test_legacy_people_without_shares_still_only_need_names():
    draft = {
        "vault": {},
        "people": [
            {"role": "beneficiary", "first_name": "Grace", "last_name": "Lee"},
        ],
    }
    text = "I give the residue of my estate to Grace Lee absolutely."
    gaps = semantic_instruction_gaps(draft, "single_will", _clause(text))
    assert RESIDUE_INSTRUCTION_GAP not in gaps


# ── prefix names (second review round) ───────────────────────────────────────

def test_short_name_not_satisfied_by_longer_name_it_prefixes():
    # 'Ann' and 'Ann Park' are DIFFERENT beneficiaries. A clause naming only
    # 'Ann Park' must not satisfy 'Ann' — word boundaries alone pass because
    # the character after 'Ann' is a space.
    draft = _draft(
        [{"fullName": "Ann"}, {"fullName": "Ann Park"}], mode="equal",
    )
    text = "I give the residue to Ann Park absolutely."
    gaps = semantic_instruction_gaps(draft, "single_will", _clause(text))
    assert RESIDUE_INSTRUCTION_GAP in gaps


def test_both_prefix_names_present_passes():
    draft = _draft(
        [{"fullName": "Ann"}, {"fullName": "Ann Park"}], mode="equal",
    )
    text = "I give the residue to Ann Park and to Ann in equal shares."
    gaps = semantic_instruction_gaps(draft, "single_will", _clause(text))
    assert RESIDUE_INSTRUCTION_GAP not in gaps
