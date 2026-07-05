from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from uuid import UUID
import uuid

class CreateDraftRequest(BaseModel):
    client_first_name: str
    client_last_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    language: str = 'en'
    province: str = 'ON'

class UpdateDraftRequest(BaseModel):
    about_you: Optional[dict] = None
    your_family: Optional[dict] = None
    your_estate: Optional[dict] = None
    your_arrangements: Optional[dict] = None
    poa_property: Optional[dict] = None
    poa_personal_care: Optional[dict] = None
    assets: Optional[List[dict]] = None
    liabilities: Optional[List[dict]] = None
    people: Optional[List[dict]] = None
    ai_flags: Optional[List[dict]] = None
    current_step: Optional[int] = None
    completed_steps: Optional[List[int]] = None
    language: Optional[str] = None
    status: Optional[str] = None
    lawyer_notes: Optional[str] = None
    design_decisions: Optional[dict] = None

class SubmitDraftRequest(BaseModel):
    draft_id: str
    firm_id: str = 'firm_demo'

class CreateLinkRequest(BaseModel):
    client_first_name: str
    client_last_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    language: str = 'en'
    firm_id: str = 'firm_demo'
    note_for_client: Optional[str] = None
    send_email: bool = True   # send questionnaire link via email
    send_sms: bool = True     # send questionnaire link via SMS (requires phone)

class SendReviewLinkRequest(BaseModel):
    send_email: bool = True
    send_sms: bool = True

class CustomReminder(BaseModel):
    id: Optional[str] = None
    label: str = Field(default='', max_length=120)
    date: str = Field(default='', max_length=20)
    recurring: bool = False

class ReminderPreferencesRequest(BaseModel):
    email_enabled: bool = True
    sms_enabled: bool = False
    email: Optional[str] = Field(default=None, max_length=254)
    phone: Optional[str] = Field(default=None, max_length=40)
    annual_reminder: bool = True
    annual_frequency: str = Field(default='yearly', pattern='^(quarterly|biannual|yearly|biennial)$')
    enabled_life_events: List[str] = Field(default_factory=list)
    custom_reminders: List[CustomReminder] = Field(default_factory=list)

class CreateLinkResponse(BaseModel):
    token: str
    draft_id: str
    link_url: str
    expires_at: str
    client_name: str

class ClauseSelection(BaseModel):
    clause_id: str
    included: bool = True
    custom_text: Optional[str] = None
    # Default clause body from the library (with {{placeholders}}). Persisted so
    # the generator has text for clauses the lawyer never hand-edited.
    template_text: Optional[str] = None
    title: Optional[str] = None
    is_folder: bool = False
    ai_generated: bool = False
    sort_order: int = 0

class SaveClausesRequest(BaseModel):
    clauses: List[ClauseSelection]

class DocumentConfig(BaseModel):
    document_type: str
    enabled: bool = True

class DocumentConfigUpdate(BaseModel):
    enabled: bool = True

class GenerateDocumentRequest(BaseModel):
    document_type: str
    format: str = "docx"  # "docx" or "pdf"

class LiabilityData(BaseModel):
    id: Optional[str] = None
    liability_type: str
    description: str = ''
    creditor: Optional[str] = None
    outstanding_balance: Optional[float] = None
    monthly_payment: Optional[float] = None
    ownership_type: str = 'sole'
    joint_owner_name: Optional[str] = None
    secured_by_asset_id: Optional[str] = None
    notes: Optional[str] = None

class ReviewApproval(BaseModel):
    document_type: str
    approved_by: Optional[str] = None

class ReviewComment(BaseModel):
    document_type: str
    clause_id: Optional[str] = None
    comment_text: str
    commenter_name: Optional[str] = None

class AgentInvokeRequest(BaseModel):
    capability: str
    payload: dict
    correlation_id: Optional[str] = None
    source_agent: Optional[str] = None

class AgentInvokeResponse(BaseModel):
    capability: str
    result: Any
    correlation_id: Optional[str] = None
