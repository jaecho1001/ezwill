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
    people: Optional[List[dict]] = None
    ai_flags: Optional[List[dict]] = None
    current_step: Optional[int] = None
    completed_steps: Optional[List[int]] = None
    language: Optional[str] = None
    status: Optional[str] = None

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

class CreateLinkResponse(BaseModel):
    token: str
    draft_id: str
    link_url: str
    expires_at: str
    client_name: str

class AgentInvokeRequest(BaseModel):
    capability: str
    payload: dict
    correlation_id: Optional[str] = None
    source_agent: Optional[str] = None

class AgentInvokeResponse(BaseModel):
    capability: str
    result: Any
    correlation_id: Optional[str] = None
