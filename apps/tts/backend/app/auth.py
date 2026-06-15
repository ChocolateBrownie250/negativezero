import hmac

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


def _session_ok(nz_session: str | None) -> bool:
    """Validate the shared `nz_session` HS256 JWT cookie.

    The HMAC key is settings.sso_session_secret used VERBATIM as a string
    (PyJWT encodes it to UTF-8 bytes internally) — matching the Node services'
    `new TextEncoder().encode(secret)`. When the secret is unset, the cookie
    path is disabled so only Bearer auth works.
    """
    if not settings.sso_session_secret or not nz_session:
        return False
    try:
        payload = jwt.decode(
            nz_session,
            settings.sso_session_secret,
            algorithms=["HS256"],
        )
    except jwt.InvalidTokenError:
        return False
    return payload.get("sub") == "owner"


def verify_auth(
    authorization: str | None = Header(None),
    nz_session: str | None = Cookie(None),
) -> None:
    """Authenticate via EITHER the Bearer API key (machine clients / iPhone
    Shortcut) OR the shared `nz_session` JWT cookie (browser PWA)."""
    if _bearer_ok(authorization):
        return
    if _session_ok(nz_session):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
    )
