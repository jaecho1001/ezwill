"""
Link service — magic link generation and validation.
"""
import os
from services.db import EWDbWriter

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")

def build_questionnaire_url(draft_id: str, token: str, language: str = "en") -> str:
    """Return a real App Router URL for the draft-bound questionnaire."""
    url = f"{BASE_URL}/intake/{draft_id}?t={token}"
    if language == "ko":
        url += "&lang=ko"
    return url


def generate_magic_link(draft_id: str, language: str = 'en',
                        client_email: str = None, client_name: str = None,
                        schema: str = None) -> dict:
    schema = schema or DEFAULT_SCHEMA
    with EWDbWriter(schema) as db:
        link = db.create_link(draft_id=draft_id, client_email=client_email, client_name=client_name)
        token = str(link['token'])
        url = build_questionnaire_url(draft_id, token, language)
        return {
            "token": token,
            "url": url,
            "expires_at": str(link['expires_at']),
        }
