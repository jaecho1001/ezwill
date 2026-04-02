"""Tests for EZWill Pydantic models."""

import pytest
from pydantic import ValidationError

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import (
    CreateDraftRequest,
    UpdateDraftRequest,
    SubmitDraftRequest,
    CreateLinkRequest,
    CreateLinkResponse,
    ClauseSelection,
    SaveClausesRequest,
    DocumentConfig,
    DocumentConfigUpdate,
    GenerateDocumentRequest,
    AgentInvokeRequest,
    AgentInvokeResponse,
)


class TestCreateDraftRequest:
    def test_valid_minimal(self):
        req = CreateDraftRequest(
            client_first_name="John",
            client_last_name="Doe",
        )
        assert req.client_first_name == "John"
        assert req.client_last_name == "Doe"
        assert req.language == "en"
        assert req.province == "ON"
        assert req.client_email is None
        assert req.client_phone is None

    def test_valid_full(self):
        req = CreateDraftRequest(
            client_first_name="Jane",
            client_last_name="Kim",
            client_email="jane@example.com",
            client_phone="+14165551234",
            language="ko",
            province="ON",
        )
        assert req.client_email == "jane@example.com"
        assert req.language == "ko"

    def test_missing_required_first_name(self):
        with pytest.raises(ValidationError):
            CreateDraftRequest(client_last_name="Doe")

    def test_missing_required_last_name(self):
        with pytest.raises(ValidationError):
            CreateDraftRequest(client_first_name="John")


class TestUpdateDraftRequest:
    def test_all_fields_optional(self):
        req = UpdateDraftRequest()
        assert req.about_you is None
        assert req.your_family is None
        assert req.your_estate is None
        assert req.your_arrangements is None
        assert req.poa_property is None
        assert req.poa_personal_care is None
        assert req.assets is None
        assert req.people is None
        assert req.ai_flags is None
        assert req.current_step is None
        assert req.completed_steps is None
        assert req.language is None
        assert req.status is None

    def test_partial_update(self):
        req = UpdateDraftRequest(
            about_you={"legalFirstName": "Updated"},
            current_step=3,
        )
        assert req.about_you == {"legalFirstName": "Updated"}
        assert req.current_step == 3
        assert req.your_family is None

    def test_assets_as_list(self):
        req = UpdateDraftRequest(
            assets=[{"id": "a1", "type": "real_estate"}]
        )
        assert len(req.assets) == 1

    def test_completed_steps_as_list(self):
        req = UpdateDraftRequest(completed_steps=[0, 1, 2])
        assert req.completed_steps == [0, 1, 2]


class TestSubmitDraftRequest:
    def test_valid(self):
        req = SubmitDraftRequest(draft_id="abc-123")
        assert req.draft_id == "abc-123"
        assert req.firm_id == "firm_demo"

    def test_custom_firm(self):
        req = SubmitDraftRequest(draft_id="x", firm_id="firm_vaturi")
        assert req.firm_id == "firm_vaturi"

    def test_missing_draft_id(self):
        with pytest.raises(ValidationError):
            SubmitDraftRequest()


class TestCreateLinkRequest:
    def test_valid_minimal(self):
        req = CreateLinkRequest(
            client_first_name="Test",
            client_last_name="User",
        )
        assert req.language == "en"
        assert req.firm_id == "firm_demo"
        assert req.note_for_client is None

    def test_valid_full(self):
        req = CreateLinkRequest(
            client_first_name="Test",
            client_last_name="User",
            client_email="test@example.com",
            language="ko",
            firm_id="firm_abc",
            note_for_client="Hello!",
        )
        assert req.note_for_client == "Hello!"

    def test_missing_required(self):
        with pytest.raises(ValidationError):
            CreateLinkRequest(client_first_name="Test")


class TestCreateLinkResponse:
    def test_valid(self):
        resp = CreateLinkResponse(
            token="abc123",
            draft_id="d-1",
            link_url="http://localhost:3000/will?t=abc123",
            expires_at="2026-04-03T00:00:00Z",
            client_name="Test User",
        )
        assert resp.token == "abc123"
        assert resp.client_name == "Test User"

    def test_missing_required(self):
        with pytest.raises(ValidationError):
            CreateLinkResponse(token="abc123")


class TestClauseSelection:
    def test_valid_defaults(self):
        cs = ClauseSelection(clause_id="rev-single")
        assert cs.clause_id == "rev-single"
        assert cs.included is True
        assert cs.custom_text is None
        assert cs.ai_generated is False
        assert cs.sort_order == 0

    def test_custom_values(self):
        cs = ClauseSelection(
            clause_id="rev-single",
            included=False,
            custom_text="Custom clause text",
            ai_generated=True,
            sort_order=5,
        )
        assert cs.included is False
        assert cs.custom_text == "Custom clause text"
        assert cs.ai_generated is True
        assert cs.sort_order == 5

    def test_missing_clause_id(self):
        with pytest.raises(ValidationError):
            ClauseSelection()


class TestSaveClausesRequest:
    def test_valid(self):
        req = SaveClausesRequest(
            clauses=[
                ClauseSelection(clause_id="rev-single"),
                ClauseSelection(clause_id="rev-probate", included=False),
            ]
        )
        assert len(req.clauses) == 2

    def test_empty_clauses(self):
        req = SaveClausesRequest(clauses=[])
        assert len(req.clauses) == 0

    def test_missing_clauses(self):
        with pytest.raises(ValidationError):
            SaveClausesRequest()


class TestDocumentConfig:
    def test_valid(self):
        dc = DocumentConfig(document_type="single_will")
        assert dc.document_type == "single_will"
        assert dc.enabled is True

    def test_disabled(self):
        dc = DocumentConfig(document_type="probate_will", enabled=False)
        assert dc.enabled is False


class TestDocumentConfigUpdate:
    def test_default_enabled(self):
        dcu = DocumentConfigUpdate()
        assert dcu.enabled is True

    def test_disabled(self):
        dcu = DocumentConfigUpdate(enabled=False)
        assert dcu.enabled is False


class TestGenerateDocumentRequest:
    def test_valid_defaults(self):
        req = GenerateDocumentRequest(document_type="single_will")
        assert req.format == "docx"

    def test_pdf_format(self):
        req = GenerateDocumentRequest(document_type="single_will", format="pdf")
        assert req.format == "pdf"

    def test_missing_document_type(self):
        with pytest.raises(ValidationError):
            GenerateDocumentRequest()


class TestAgentInvokeRequest:
    def test_valid_minimal(self):
        req = AgentInvokeRequest(
            capability="draft_will",
            payload={"firstName": "John"},
        )
        assert req.capability == "draft_will"
        assert req.correlation_id is None
        assert req.source_agent is None

    def test_valid_full(self):
        req = AgentInvokeRequest(
            capability="run_ai_flags",
            payload={"draft_id": "abc"},
            correlation_id="corr-1",
            source_agent="reception",
        )
        assert req.correlation_id == "corr-1"

    def test_missing_required(self):
        with pytest.raises(ValidationError):
            AgentInvokeRequest(capability="test")


class TestAgentInvokeResponse:
    def test_valid(self):
        resp = AgentInvokeResponse(
            capability="draft_will",
            result={"draft_id": "abc", "magic_link": "http://..."},
        )
        assert resp.result["draft_id"] == "abc"

    def test_with_correlation(self):
        resp = AgentInvokeResponse(
            capability="test",
            result=42,
            correlation_id="c-1",
        )
        assert resp.correlation_id == "c-1"

    def test_missing_required(self):
        with pytest.raises(ValidationError):
            AgentInvokeResponse(capability="test")
