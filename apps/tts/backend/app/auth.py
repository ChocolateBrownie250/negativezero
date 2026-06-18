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
    """Constant-time check of the Authorization: Bearer <key> header (the legacy
    single owner key, kept for the iPhone Shortcut)."""
    if not authorization or not authorization.startswith("Bearer "):
        return False
    presented = authorization.removeprefix("Bearer ").strip()
    return hmac.compare_digest(presented, settings.amethyst_api_key)


def _api_token_claims(authorization: str | None) -> tuple[str, int | None, str | None] | None:
    """Parse a per-account API token from the Authorization header.

    These are admin-minted JWTs (scope "api", svc "tts") signed with the same
    SSO secret. Returns ``(account_id, iat_seconds, jti)`` or None. The legacy
    owner Bearer key is handled separately by `_bearer_ok` and is not a JWT.
    """
    if not settings.sso_session_secret or not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    presented = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(presented, settings.sso_session_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    if payload.get("scope") != "api" or payload.get("svc") != "tts":
        return None
    sub = payload.get("sub")
    if not (isinstance(sub, str) and sub):
        return None
    iat = payload.get("iat")
    iat_s = int(iat) if isinstance(iat, (int, float)) else None
    jti = payload.get("jti")
    return sub, iat_s, (jti if isinstance(jti, str) else None)


def _session_claims(nz_session: str | None) -> tuple[str, int | None] | None:
    """Validate the shared `nz_session` HS256 JWT cookie and return
    ``(account_id, issued_at_seconds)`` for any valid signature with a non-empty
    `sub`, else None.

    The HMAC key is settings.sso_session_secret used VERBATIM (PyJWT encodes to
    UTF-8 internally) — byte-for-byte matching the Node services' `jose` setup.
    When the secret is unset the cookie path is disabled.
    """
    if not settings.sso_session_secret or not nz_session:
        return None
    try:
        payload = jwt.decode(nz_session, settings.sso_session_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    sub = payload.get("sub")
    if not (isinstance(sub, str) and sub):
        return None
    iat = payload.get("iat")
    iat_s = int(iat) if isinstance(iat, (int, float)) else None
    return sub, iat_s


# ---------------------------------------------------------------------------
# Per-service authorization (admin service is the source of truth).
#
# The decision ("allow" | "deny" | "reauth") is owned by admin and checked LIVE
# on every request — no positive caching — so a revoke in admin takes effect
# immediately. We keep only a brief "last good" answer per key to ride out a
# transient admin blip; past that we fail closed with "deny".
# ---------------------------------------------------------------------------
_AUTHZ_STALE_MAX = 15.0  # seconds a cached decision may be served on admin error

# key "account:service:iat" -> (decision, fetched_at monotonic)
_authz_last_good: dict[str, tuple[str, float]] = {}


def _authz_cache_clear() -> None:
    """Test helper — drop all remembered authorization decisions."""
    _authz_last_good.clear()


async def _fetch_decision(
    account: str, service: str, iat: int | None, jti: str | None = None
) -> str:
    """Ask admin for the live decision for (account, service, token iat[, jti])."""
    url = settings.admin_authz_url.rstrip("/") + "/api/internal/authz"
    params: dict[str, str] = {"account": account, "service": service}
    if iat is not None:
        params["iat"] = str(iat)
    if jti is not None:
        params["jti"] = jti
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            url,
            params=params,
            headers={"Authorization": f"Bearer {settings.sso_session_secret}"},
        )
        resp.raise_for_status()
        data = resp.json()
    decision = data.get("decision")
    return decision if decision in ("allow", "deny", "reauth") else "deny"


async def authorize(account: str, service: str, iat: int | None, jti: str | None = None) -> str:
    """Live per-service authorization decision: 'allow' | 'deny' | 'reauth'.

    - `admin_authz_url` unset → 'allow' (skip; incremental rollout).
    - Otherwise query admin every time; on success remember & return.
    - On admin error: serve a recent remembered decision (≤15s) else 'deny'.
    """
    if not settings.admin_authz_url:
        return "allow"

    key = f"{account}:{service}:{iat if iat is not None else ''}:{jti or ''}"
    now = time.monotonic()
    try:
        decision = await _fetch_decision(account, service, iat, jti)
    except Exception:
        hit = _authz_last_good.get(key)
        if hit is not None and (now - hit[1]) <= _AUTHZ_STALE_MAX:
            return hit[0]
        return "deny"
    _authz_last_good[key] = (decision, now)
    return decision


async def verify_auth(
    authorization: str | None = Header(None),
    nz_session: str | None = Cookie(None),
) -> None:
    """Authenticate via EITHER the Bearer API key (iPhone Shortcut / owner) OR
    the shared `nz_session` JWT cookie (browser PWA), then authorize for "tts".

    - Bearer matches AMETHYST_API_KEY → allow (owner, full access, no authz).
    - Valid SSO cookie → live authz for "tts": allow → ok; deny → 403;
      reauth (revoked/disabled session) → 401 so the client logs in again.
    - Neither → 401.
    """
    # 1) Legacy single owner key (iPhone Shortcut today) → full access.
    if _bearer_ok(authorization):
        return

    # 2) Per-account API token (admin-minted JWT, scope "api") via Bearer.
    api = _api_token_claims(authorization)
    if api is not None:
        account, iat, jti = api
        decision = await authorize(account, "tts", iat, jti)
        if decision == "allow":
            return
        # For a machine token there is no interactive re-login: a revoked token
        # or a dropped grant is simply unauthorized.
        if decision == "reauth":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="token_revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="tts access not enabled for this account",
        )

    # 3) Browser PWA via the shared SSO cookie.
    claims = _session_claims(nz_session)
    if claims is not None:
        account, iat = claims
        decision = await authorize(account, "tts", iat)
        if decision == "allow":
            return
        if decision == "reauth":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="session_revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="tts access not enabled for this account",
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
    )
