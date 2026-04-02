"""
Link service — magic link generation and validation.
"""
import os
from services.db import EWDbWriter

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")

def generate_magic_link(draft_id: str, language: str = 'en',
                        client_email: str = None, client_name: str = None,
                        schema: str = None) -> dict:
    schema = schema or DEFAULT_SCHEMA
    with EWDbWriter(schema) as db:
        link = db.create_link(draft_id=draft_id, client_email=client_email, client_name=client_name)
        token = str(link['token'])
        url = f"{BASE_URL}/will?t={token}"
        if language == 'ko':
            url += "&lang=ko"
        return {
            "token": token,
            "url": url,
            "expires_at": str(link['expires_at']),
        }
