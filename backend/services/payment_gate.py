"""Server-side payment gate for document delivery.

Policy (PAYMENT_ENFORCEMENT env var, read at call time):
  - "self_serve" (default): drafts started from the public site must be paid
    before documents are delivered; lawyer-created drafts are exempt because
    the firm bills those directly, outside the app.
  - "all": every draft must be paid before delivery.
  - "off": no payment gating anywhere.

"paid" is the only status that satisfies the gate — "refunded" deliberately
counts as unpaid, so a refunded client cannot keep generating documents.
"""

from __future__ import annotations

import os

PAID_STATUSES = {"paid"}

_VALID_MODES = {"off", "self_serve", "all"}


def enforcement_mode() -> str:
    mode = os.getenv("PAYMENT_ENFORCEMENT", "self_serve").strip().lower()
    return mode if mode in _VALID_MODES else "self_serve"


def payment_required(draft: dict) -> bool:
    """True when document delivery must be refused until this draft is paid.

    Rows created before migration 38 have no origin column value in older
    snapshots; they are treated as lawyer-created (exempt under the default
    policy), which preserves pre-migration behavior.
    """
    mode = enforcement_mode()
    if mode == "off":
        return False
    if mode == "self_serve" and (draft.get("origin") or "lawyer") != "self_serve":
        return False
    return draft.get("payment_status") not in PAID_STATUSES
