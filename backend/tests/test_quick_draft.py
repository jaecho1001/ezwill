"""Test quick_draft capability logic (no real OpenAI calls)."""

import json
import sys
import os
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

# Ensure the project root is on sys.path so we can import routes.agents
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.agents import _has_business_assets, _build_client_summary


# ── _has_business_assets tests ────────────────────────────────────────────────


class TestHasBusinessAssets:
    def test_no_assets_at_all(self):
        assert _has_business_assets({}) is False

    def test_empty_assets_list(self):
        assert _has_business_assets({"assets": []}) is False

    def test_real_estate_only(self):
        data = {"assets": [{"assetType": "real_estate", "description": "Family home"}]}
        assert _has_business_assets(data) is False

    def test_asset_type_business(self):
        data = {"assets": [{"assetType": "business", "description": "My shop"}]}
        assert _has_business_assets(data) is True

    def test_asset_type_private_corp(self):
        data = {"assets": [{"assetType": "private_corp", "description": "Holdco"}]}
        assert _has_business_assets(data) is True

    def test_asset_type_shares(self):
        data = {"assets": [{"assetType": "shares", "description": "Corp shares"}]}
        assert _has_business_assets(data) is True

    def test_asset_type_corporation(self):
        data = {"assets": [{"assetType": "corporation", "description": "Opco"}]}
        assert _has_business_assets(data) is True

    def test_description_contains_private_company(self):
        data = {"assets": [{"assetType": "other", "description": "Shares in private company XYZ"}]}
        assert _has_business_assets(data) is True

    def test_description_contains_corporation(self):
        data = {"assets": [{"assetType": "other", "description": "My corporation holdings"}]}
        assert _has_business_assets(data) is True

    def test_description_contains_business(self):
        data = {"assets": [{"assetType": "other", "description": "Small business interest"}]}
        assert _has_business_assets(data) is True

    def test_estate_has_business_assets_camel(self):
        data = {"your_estate": {"hasBusinessAssets": True}}
        assert _has_business_assets(data) is True

    def test_estate_has_business_assets_snake(self):
        data = {"your_estate": {"has_business_assets": True}}
        assert _has_business_assets(data) is True

    def test_estate_flag_false(self):
        data = {"your_estate": {"hasBusinessAssets": False}}
        assert _has_business_assets(data) is False

    def test_asset_type_case_insensitive(self):
        data = {"assets": [{"assetType": "Business", "description": ""}]}
        assert _has_business_assets(data) is True

    def test_snake_case_asset_type_key(self):
        """The function checks both 'assetType' and 'asset_type' keys."""
        data = {"assets": [{"asset_type": "private_corp", "description": "Holdco"}]}
        assert _has_business_assets(data) is True

    def test_mixed_assets_one_is_business(self):
        data = {
            "assets": [
                {"assetType": "real_estate", "description": "Home"},
                {"assetType": "bank_account", "description": "Savings"},
                {"assetType": "business", "description": "My Inc."},
            ]
        }
        assert _has_business_assets(data) is True


# ── _build_client_summary tests ──────────────────────────────────────────────


class TestBuildClientSummary:
    def test_minimal_client(self):
        result = _build_client_summary({})
        assert "Client Name:" in result

    def test_client_name_camel_case(self):
        data = {"firstName": "John", "lastName": "Doe"}
        result = _build_client_summary(data)
        assert "John Doe" in result

    def test_client_name_snake_case(self):
        data = {"client_first_name": "Jane", "client_last_name": "Smith"}
        result = _build_client_summary(data)
        assert "Jane Smith" in result

    def test_about_you_section(self):
        data = {
            "about_you": {
                "city": "Toronto",
                "maritalStatus": "Married",
                "address": "123 Bay St",
            }
        }
        result = _build_client_summary(data)
        assert "City: Toronto" in result
        assert "Marital Status: Married" in result
        assert "Address: 123 Bay St" in result

    def test_spouse_and_children(self):
        data = {
            "your_family": {
                "spouseFullName": "Jane Doe",
                "children": [
                    {"firstName": "Alice", "lastName": "Doe", "isMinor": True},
                    {"firstName": "Bob", "lastName": "Doe", "isMinor": False},
                ],
            }
        }
        result = _build_client_summary(data)
        assert "Spouse: Jane Doe" in result
        assert "Children:" in result
        assert "Alice Doe" in result
        assert "Bob Doe" in result
        assert "Minor children: 1" in result

    def test_children_with_name_key(self):
        """Children can have a 'name' key instead of firstName/lastName."""
        data = {
            "your_family": {
                "children": [{"name": "Charlie Doe"}],
            }
        }
        result = _build_client_summary(data)
        assert "Charlie Doe" in result

    def test_estate_section(self):
        data = {
            "your_estate": {
                "survivalDays": 30,
                "trustDistributionAge": 25,
            }
        }
        result = _build_client_summary(data)
        assert "Survival Period: 30 days" in result
        assert "Trust Distribution Age: 25" in result

    def test_assets_section(self):
        data = {
            "assets": [
                {"description": "Family home", "estimatedValue": 800000},
                {"assetType": "Savings", "estimatedValue": 50000},
            ]
        }
        result = _build_client_summary(data)
        assert "Assets (2):" in result
        assert "Family home: $800000" in result
        assert "Savings: $50000" in result

    def test_liabilities_section(self):
        data = {
            "liabilities": [
                {"description": "Mortgage", "amount": 400000},
            ]
        }
        result = _build_client_summary(data)
        assert "Liabilities (1):" in result
        assert "Mortgage: $400000" in result

    def test_people_section(self):
        data = {
            "people": [
                {"role": "executor", "firstName": "Sam", "lastName": "Cho"},
            ]
        }
        result = _build_client_summary(data)
        assert "Named People:" in result
        assert "executor: Sam Cho" in result

    def test_poa_sections_included(self):
        data = {
            "poa_property": {"attorney": "Jane"},
            "poa_personal_care": {"wishes": "no life support"},
        }
        result = _build_client_summary(data)
        assert "POA Property preferences:" in result
        assert "POA Personal Care preferences:" in result


# ── Quick draft response structure tests ─────────────────────────────────────


SAMPLE_AI_RESPONSE = {
    "needs_dual_will": True,
    "reasoning": "Client has private corporation shares",
    "document_types": ["primary_will", "secondary_will", "poa_property", "poa_personal_care"],
    "clause_selections": {
        "primary_will": [
            {
                "clause_id": "revocation",
                "included": True,
                "custom_text": None,
                "ai_generated": False,
                "sort_order": 1,
            },
            {
                "clause_id": "executor_appointment",
                "included": True,
                "custom_text": "I appoint Sam Cho as my Executor.",
                "ai_generated": False,
                "sort_order": 2,
            },
        ],
        "secondary_will": [
            {
                "clause_id": "revocation",
                "included": True,
                "custom_text": None,
                "ai_generated": False,
                "sort_order": 1,
            },
        ],
    },
    "variables": {
        "executor_name": "Sam Cho",
        "spouse_name": "Jane Doe",
    },
    "warnings": ["Guardian not specified for minor children"],
}


class TestQuickDraftResponseStructure:
    def test_sample_has_required_keys(self):
        required = {"needs_dual_will", "reasoning", "document_types", "clause_selections", "variables", "warnings"}
        assert required.issubset(SAMPLE_AI_RESPONSE.keys())

    def test_clause_selections_per_doc_type(self):
        for doc_type in SAMPLE_AI_RESPONSE["document_types"]:
            if doc_type in SAMPLE_AI_RESPONSE["clause_selections"]:
                clauses = SAMPLE_AI_RESPONSE["clause_selections"][doc_type]
                assert isinstance(clauses, list)
                for clause in clauses:
                    assert "clause_id" in clause
                    assert "included" in clause
                    assert "sort_order" in clause

    def test_document_types_are_valid(self):
        valid = {"primary_will", "secondary_will", "poa_property", "poa_personal_care"}
        for dt in SAMPLE_AI_RESPONSE["document_types"]:
            assert dt in valid

    def test_dual_will_includes_secondary(self):
        if SAMPLE_AI_RESPONSE["needs_dual_will"]:
            assert "secondary_will" in SAMPLE_AI_RESPONSE["document_types"]

    def test_variables_is_dict(self):
        assert isinstance(SAMPLE_AI_RESPONSE["variables"], dict)

    def test_warnings_is_list(self):
        assert isinstance(SAMPLE_AI_RESPONSE["warnings"], list)


# ── Mock OpenAI integration test ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_capability_quick_draft_mocked(monkeypatch):
    """End-to-end test of _capability_quick_draft with mocked OpenAI call."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")  # exercise the LLM path
    from routes.agents import _capability_quick_draft

    client_data = {
        "firstName": "John",
        "lastName": "Doe",
        "about_you": {"city": "Toronto", "maritalStatus": "Married"},
        "your_family": {
            "spouseFullName": "Jane Doe",
            "children": [{"firstName": "Alice", "lastName": "Doe", "isMinor": True}],
        },
        "your_estate": {"hasBusinessAssets": True, "survivalDays": 30},
        "assets": [
            {"assetType": "business", "description": "Private Corp", "estimatedValue": 500000},
            {"assetType": "real_estate", "description": "Home", "estimatedValue": 900000},
        ],
    }

    payload = {"client_data": client_data}

    with patch("routes.agents._call_openai_quick_draft", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = SAMPLE_AI_RESPONSE

        response = await _capability_quick_draft(payload, correlation_id="test-123")

        # Verify the mock was called with a summary that includes dual will note
        call_args = mock_ai.call_args[0][0]
        assert "Dual will strategy is recommended" in call_args

        # Verify the response structure
        assert response.capability == "quick_draft"
        assert response.correlation_id == "test-123"
        assert response.result["needs_dual_will"] is True
        assert "primary_will" in response.result["document_types"]
        assert response.result["saved"] is False  # No draft_id provided


@pytest.mark.asyncio
async def test_capability_quick_draft_single_will(monkeypatch):
    """When no business assets, AI summary should say single will is sufficient."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")  # exercise the LLM path
    from routes.agents import _capability_quick_draft

    client_data = {
        "firstName": "Jane",
        "lastName": "Smith",
        "assets": [{"assetType": "real_estate", "description": "Home", "estimatedValue": 600000}],
    }

    single_will_response = {
        "needs_dual_will": False,
        "reasoning": "No private corporation assets found",
        "document_types": ["primary_will", "poa_property", "poa_personal_care"],
        "clause_selections": {
            "primary_will": [
                {"clause_id": "revocation", "included": True, "custom_text": None, "ai_generated": False, "sort_order": 1},
            ],
        },
        "variables": {},
        "warnings": [],
    }

    with patch("routes.agents._call_openai_quick_draft", new_callable=AsyncMock) as mock_ai:
        mock_ai.return_value = single_will_response

        response = await _capability_quick_draft({"client_data": client_data}, correlation_id="test-456")

        call_args = mock_ai.call_args[0][0]
        assert "Single primary will is likely sufficient" in call_args

        assert response.result["needs_dual_will"] is False
        assert "secondary_will" not in response.result["document_types"]


@pytest.mark.asyncio
async def test_capability_quick_draft_empty_client_data():
    """Should raise HTTPException when client_data is empty."""
    from routes.agents import _capability_quick_draft
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await _capability_quick_draft({"client_data": {}}, correlation_id="test-err")

    assert exc_info.value.status_code == 400


# ── Doc-type normalization + deterministic (no-key) engine ──────────────────

def test_normalize_doc_type_maps_legacy_and_dual_vocab():
    from routes.agents import _normalize_doc_type
    assert _normalize_doc_type("primary_will", needs_dual=True) == "probate_will"
    assert _normalize_doc_type("primary_will", needs_dual=False) == "single_will"
    assert _normalize_doc_type("secondary_will", needs_dual=True) == "non_probate_will"
    assert _normalize_doc_type("poa_property", needs_dual=False) == "poa_property"
    assert _normalize_doc_type("not_a_real_type", needs_dual=False) is None


def test_deterministic_quick_draft_dual_vs_single():
    from routes.agents import _deterministic_quick_draft
    dual = _deterministic_quick_draft({}, needs_dual=True)
    assert dual["needs_dual_will"] is True
    assert set(dual["document_types"]) == {
        "probate_will", "non_probate_will", "poa_property", "poa_personal_care"
    }
    assert dual["engine"] == "rules"

    single = _deterministic_quick_draft({}, needs_dual=False)
    assert single["needs_dual_will"] is False
    assert "single_will" in single["document_types"]
    assert "non_probate_will" not in single["document_types"]


@pytest.mark.asyncio
async def test_quick_draft_falls_back_to_rules_without_key(monkeypatch):
    """Without OPENAI_API_KEY, quick_draft uses the deterministic engine, and a
    client with business assets is steered to a dual will."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from routes.agents import _capability_quick_draft
    client_data = {"assets": [{"assetType": "business", "description": "Private Corp shares"}]}
    resp = await _capability_quick_draft({"client_data": client_data}, correlation_id="t")
    assert resp.result["engine"] == "rules"
    assert resp.result["needs_dual_will"] is True
    assert "non_probate_will" in resp.result["document_types"]
