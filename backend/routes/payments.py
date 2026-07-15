"""Payments — Stripe Checkout when configured, a simulated path otherwise.

A client pays for their estate-plan package (Essential / Complete / Couples).
Checkout is authorized by the client's own draft token or a dashboard session.
Without a STRIPE_SECRET_KEY the flow runs in simulation so it's testable locally.
"""

import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from routes.auth import verify_client_or_dashboard_draft_access
from services.db import EWDbWriter
from services.pricing import PRICING_TIERS, get_tier

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")


class CheckoutRequest(BaseModel):
    tier: str


def _stripe_enabled() -> bool:
    return bool(os.getenv("STRIPE_SECRET_KEY"))


@router.get("/tiers")
async def list_tiers():
    """Public: pricing tiers for the checkout page + which processor is active."""
    return {
        "tiers": list(PRICING_TIERS.values()),
        "processor": "stripe" if _stripe_enabled() else "simulated",
    }


@router.get("/{draft_id}")
async def payment_status(draft_id: str, _auth=Depends(verify_client_or_dashboard_draft_access)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        d = dict(draft)
        return {
            "payment_status": d.get("payment_status", "unpaid"),
            "payment_tier": d.get("payment_tier"),
            "paid_at": str(d["paid_at"]) if d.get("paid_at") else None,
        }


@router.post("/checkout/{draft_id}")
async def create_checkout(
    draft_id: str,
    body: CheckoutRequest,
    _auth=Depends(verify_client_or_dashboard_draft_access),
):
    tier = get_tier(body.tier)
    if not tier:
        raise HTTPException(400, f"Unknown tier: {body.tier}")
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        if not db.get_draft(draft_id):
            raise HTTPException(404, "Draft not found")

        if _stripe_enabled():
            import stripe
            stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
            session = stripe.checkout.Session.create(
                mode="payment",
                line_items=[{
                    "price_data": {
                        "currency": tier["currency"],
                        "product_data": {"name": f"EZWill — {tier['name']} package"},
                        "unit_amount": tier["amount_cents"],
                    },
                    "quantity": 1,
                }],
                success_url=f"{BASE_URL}/checkout/{draft_id}/success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{BASE_URL}/checkout/{draft_id}",
                metadata={"draft_id": draft_id, "tier": body.tier},
            )
            db.update_draft(draft_id, {
                "payment_status": "pending", "payment_tier": body.tier, "payment_ref": session.id,
            })
            return {"url": session.url, "simulated": False}

        # Simulated path (no Stripe key): mark pending; the checkout page confirms.
        ref = f"simulated:{uuid.uuid4()}"
        db.update_draft(draft_id, {
            "payment_status": "pending", "payment_tier": body.tier, "payment_ref": ref,
        })
        return {"url": f"{BASE_URL}/checkout/{draft_id}?simulate=1", "simulated": True}


@router.post("/confirm/{draft_id}")
async def confirm_simulated(draft_id: str, _auth=Depends(verify_client_or_dashboard_draft_access)):
    """Complete a SIMULATED payment. Disabled when Stripe is configured (real
    payments only complete via the Stripe webhook)."""
    if _stripe_enabled():
        raise HTTPException(403, "Simulated confirmation is disabled when Stripe is configured")
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        if not db.get_draft(draft_id):
            raise HTTPException(404, "Draft not found")
        db.update_draft(draft_id, {
            "payment_status": "paid", "paid_at": datetime.now(timezone.utc),
        })
        return {"payment_status": "paid"}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Stripe → mark the draft paid on checkout.session.completed."""
    if not _stripe_enabled():
        raise HTTPException(503, "Stripe not configured")
    import stripe
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    try:
        if secret:
            event = stripe.Webhook.construct_event(payload, sig, secret)
        else:
            import json as _json
            event = _json.loads(payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Invalid webhook: {exc}")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        draft_id = (session.get("metadata") or {}).get("draft_id")
        if draft_id:
            with EWDbWriter(DEFAULT_SCHEMA) as db:
                db.update_draft(draft_id, {
                    "payment_status": "paid",
                    "paid_at": datetime.now(timezone.utc),
                    "payment_ref": session.get("id"),
                })
    return {"received": True}
