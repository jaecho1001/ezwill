import os
import logging
import httpx

logger = logging.getLogger(__name__)

FIRM_EMAIL = os.getenv("FIRM_EMAIL", "lawyers@yourfirm.com")
FIRM_NAME = os.getenv("FIRM_NAME", "Your Law Firm")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")

async def notify_lawyer_submission(draft: dict, flags: list):
    """Send email to lawyer when client submits will questionnaire."""

    client_name = f"{draft.get('client_first_name', '')} {draft.get('client_last_name', '')}".strip()
    draft_id = str(draft.get('id', ''))

    critical_flags = [f for f in flags if f.get('severity') == 'critical']
    warning_flags = [f for f in flags if f.get('severity') == 'warning']

    flag_lines = []
    for f in critical_flags:
        flag_lines.append(f"  [CRITICAL] {f.get('title', '')}")
    for f in warning_flags:
        flag_lines.append(f"  [WARNING] {f.get('title', '')}")

    flags_text = "\n".join(flag_lines) if flag_lines else "  No issues detected"

    subject = f"Will Questionnaire Submitted — {client_name}"

    body = f"""
{client_name} has completed their will questionnaire.

Name: {client_name}
Email: {draft.get('client_email', 'Not provided')}
Phone: {draft.get('client_phone', 'Not provided')}
Language: {'Korean' if draft.get('language') == 'ko' else 'English'}
Submitted: {draft.get('submitted_at', '')}

Ontario AI Flags:
{flags_text}

View in Dashboard:
{BASE_URL}/dashboard/clients/{draft_id}

---
EZWill — {FIRM_NAME}
"""

    # SendGrid integration (if API key set)
    api_key = os.getenv("SENDGRID_API_KEY")
    if api_key:
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "personalizations": [{"to": [{"email": FIRM_EMAIL}]}],
                        "from": {"email": "noreply@ezwill.app", "name": "EZWill"},
                        "subject": subject,
                        "content": [{"type": "text/plain", "value": body}],
                    },
                    timeout=10,
                )
        except Exception as e:
            logger.error(f"SendGrid error: {e}")
    else:
        # Log to stdout in dev
        logger.info(f"[EMAIL] {subject}\n{body}")
