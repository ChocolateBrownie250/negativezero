import hmac
import time

import httpx
import jwt
from fastapi import Cookie, Header, HTTPException, status

from .config import settings


def verify_api_key(authorization: str | None = Header(None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    presented = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(presented, settings.amethyst_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _bearer_ok(authorization: str | None) -> bool:
    """Constant-time check of the Authorization: Bearer <key> header."""
    if not authorization or not authorization.startswith("Bearer "):
        return False
    presented = authorization.removeprefix("Bearer ").strip()
    return hmac.compare_digest(presented, settings.amethyst_api_key)


def _session_ok(nz_session: str | None) -> str | None:
    """Validate the shared `nz_session` HS256 JWT cookie.

    The HMAC key is settings.sso_session_secret used VERBATIM as a string
    (PyJWT encodes it to UTF-8 bytes internally) — matching the Node services'
    `new TextEncoder().encode(secret)`. When the secret is unset, the cookie
    path is disabled so only Bearer auth works.

    Returns the account id (`sub`) for any valid signature with a non-empty
    `sub`, else None. The account no longer has to be `"owner"` — multi-account
    SSO carries the account id in `sub`.
    """
    if not settings.sso_session_secret or not nz_session:
        return None
    try:
        payload = jwt.decode(
            nz_session,
            settings.sso_session_secret,
            algorithms=["HS256"],
        )
    except jwt.InvalidTokenError:
        return None
    sub = payload.get("sub")
    if isinstance(sub, str) and sub:
        return sub
    return None


# ---------------------------------------------------------------------------
# Per-service authorization (admin service).
#
# Decision for "is account <sub> allowed to use service <service>?" is owned by
# the admin service. We cache decisions briefly (TTL ~30s) to avoid hammering
# admin on every request, and serve a recent stale value (≤10 min) if admin is
# temporarily unreachable — failing open only within that recent window, else
# denying.
# ---------------------------------------------------------------------------
_AUTHZ_TTL = 30.0          # seconds a fresh value is trusted without refetch
_AUTHZ_STALE_MAX = 600.0   # seconds a cached value may be served on admin error

# key "account:service" -> (allowed: bool, fetched_at: float)
_authz_cache: dict[str, tuple[bool, float]] = {}


def _authz_cache_clear() -> None:
    """Test helper — drop all cached authorization decisions."""
    _authz_cache.clear()


async def _fetch_authz(account: str, service: str) -> bool:
    """Ask the admin service whether `account` may use `service`."""
    url = settings.admin_authz_url.rstrip("/") + "/api/internal/authz"
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            url,
            params={"account": account, "service": service},
            headers={"Authorization": f"Bearer {settings.sso_session_secret}"},
        )
        resp.raise_for_status()
        data = resp.json()
    return bool(data.get("allowed"))


async def is_authorized(account: str, service: str) -> bool:
    """Cached per-service authorization check.

    - When `admin_authz_url` is unset → return True (skip, incremental rollout).
    - Fresh cache hit (≤TTL) → return cached value.
    - Otherwise query admin; on success cache & return.
    - On admin error: serve a recent cached value (≤10 min) if present,
      else deny (False).
    """
    if not settings.admin_authz_url:
        return True

    cache_key = f"{account}:{service}"
    now = time.monotonic()
    cached = _authz_cache.get(cache_key)
    if cached is not None and (now - cached[1]) <= _AUTHZ_TTL:
        return cached[0]

    try:
        allowed = await _fetch_authz(account, service)
    except Exception:
        if cached is not None and (now - cached[1]) <= _AUTHZ_STALE_MAX:
            return cached[0]
        return False

    _authz_cache[cache_key] = (allowed, now)
    return allowed


async def verify_auth(
    authorization: str | None = Header(None),
    nz_session: str | None = Cookie(None),
) -> None:
    """Authenticate via EITHER the Bearer API key (machine clients / iPhone
    Shortcut) OR the shared `nz_session` JWT cookie (browser PWA).

    - Bearer matches AMETHYST_API_KEY → allow (treated as owner, full access,
      no per-service authz check).
    - Valid SSO cookie resolving to an account → check per-service authz for
      "tts"; allow if authorized, else 403.
    - Neither → 401.
    """
    if _bearer_ok(authorization):
        return
    account = _session_ok(nz_session)
    if account is not None:
        if await is_authorized(account, "tts"):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="tts access not enabled for this account",
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
    )
