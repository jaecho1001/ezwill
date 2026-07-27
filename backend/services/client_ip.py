"""Proxy-aware client IP resolution for rate limiting (issue #91).

Behind the reverse proxy the deployment plan prescribes (Fly/Vercel/nginx),
``request.client.host`` is the proxy's address for every request, so all
rate-limit buckets collapse into one: a single abusive client can lock out
every login, and the self-serve draft cap becomes global.

TRUST_PROXY is opt-in and off by default, because honouring X-Forwarded-For
from a client that is NOT behind a trusted proxy lets anyone spoof their
bucket key with a forged header — strictly worse than the collapsed bucket.
Set TRUST_PROXY=true only when a proxy you control terminates all traffic
and overwrites (not appends to) the client-supplied header chain's last hop.
"""

from __future__ import annotations

import os


def _trust_proxy() -> bool:
    return os.getenv("TRUST_PROXY", "").strip().lower() in {"1", "true", "yes"}


def client_ip(request) -> str:
    """Bucket key for rate limiting: direct peer, or the rightmost
    X-Forwarded-For hop when TRUST_PROXY is enabled."""
    direct = request.client.host if request.client else "unknown"
    if not _trust_proxy():
        return direct
    forwarded = request.headers.get("x-forwarded-for", "")
    if not forwarded:
        return direct
    # Rightmost hop is the one the trusted proxy itself appended; everything
    # left of it is client-controlled and forgeable.
    return forwarded.split(",")[-1].strip() or direct
