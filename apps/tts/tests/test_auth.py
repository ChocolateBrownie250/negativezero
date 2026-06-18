"""Unit tests for the tts auth layer (Bearer key + SSO cookie + per-service authz).

These run fully in-process against a tiny FastAPI app wired to verify_auth, so
they exercise the real dependency without a deployed backend. Required settings
env vars are set in conftest before the app package is imported.
"""
from __future__ import annotations

import time

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend.app import auth as auth_mod
from backend.app.auth import verify_auth
from backend.app.config import settings

API_KEY = settings.amethyst_api_key
SECRET = settings.sso_session_secret


def _make_client() -> TestClient:
    app = FastAPI()

    @app.get("/protected", dependencies=[Depends(verify_auth)])
    def protected():
        return {"ok": True}

    return TestClient(app)


def _sso_cookie(sub: str, iat: int | None = None) -> str:
    payload: dict = {"sub": sub}
    if iat is not None:
        payload["iat"] = iat
    return jwt.encode(payload, SECRET, algorithm="HS256")


@pytest.fixture(autouse=True)
def _clear_authz_cache():
    auth_mod._authz_cache_clear()
    yield
    auth_mod._authz_cache_clear()


@pytest.fixture
def client() -> TestClient:
    return _make_client()


# --------------------------------------------------------------------------
# Bearer API key path (iPhone Shortcut / owner) — must keep working.
# --------------------------------------------------------------------------
def test_bearer_key_allows(client, monkeypatch):
    # Even with authz configured, the Bearer key bypasses the authz check.
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")
    r = client.get("/protected", headers={"Authorization": f"Bearer {API_KEY}"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_no_auth_returns_401(client):
    r = client.get("/protected")
    assert r.status_code == 401


def test_bad_bearer_returns_401(client):
    r = client.get("/protected", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


# --------------------------------------------------------------------------
# SSO cookie path with authz disabled (admin_authz_url unset) — any valid SSO.
# --------------------------------------------------------------------------
def test_sso_allowed_when_authz_unset(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "")
    r = client.get("/protected", cookies={"nz_session": _sso_cookie("someacct")})
    assert r.status_code == 200


def test_invalid_sso_signature_401(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "")
    bad = jwt.encode({"sub": "owner"}, "wrong-secret", algorithm="HS256")
    r = client.get("/protected", cookies={"nz_session": bad})
    assert r.status_code == 401


# --------------------------------------------------------------------------
# SSO cookie path with authz enabled — admin returns a decision.
# --------------------------------------------------------------------------
def test_sso_deny_returns_403(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def fake(account, service, iat, jti=None):
        return "deny"

    monkeypatch.setattr(auth_mod, "_fetch_decision", fake)
    r = client.get("/protected", cookies={"nz_session": _sso_cookie("acct-no-tts")})
    assert r.status_code == 403
    assert "tts access not enabled" in r.json()["detail"]


def test_sso_allow_returns_200(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def fake(account, service, iat, jti=None):
        assert service == "tts"
        return "allow"

    monkeypatch.setattr(auth_mod, "_fetch_decision", fake)
    r = client.get("/protected", cookies={"nz_session": _sso_cookie("acct-tts")})
    assert r.status_code == 200


def test_sso_reauth_returns_401(client, monkeypatch):
    # A revoked/stale session → admin says 'reauth' → 401 so the client re-logs.
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def fake(account, service, iat, jti=None):
        return "reauth"

    monkeypatch.setattr(auth_mod, "_fetch_decision", fake)
    r = client.get("/protected", cookies={"nz_session": _sso_cookie("acct-revoked", iat=1)})
    assert r.status_code == 401


def test_iat_is_forwarded(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")
    seen = {}

    async def fake(account, service, iat, jti=None):
        seen["iat"] = iat
        return "allow"

    monkeypatch.setattr(auth_mod, "_fetch_decision", fake)
    r = client.get("/protected", cookies={"nz_session": _sso_cookie("a", iat=1234567)})
    assert r.status_code == 200
    assert seen["iat"] == 1234567


# --------------------------------------------------------------------------
# authorize(): live checks, stale-on-error, fail-closed, skip-when-unset.
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_authorize_is_live_no_positive_cache(monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")
    calls = {"n": 0}

    async def fake(account, service, iat, jti=None):
        calls["n"] += 1
        return "allow"

    monkeypatch.setattr(auth_mod, "_fetch_decision", fake)
    assert await auth_mod.authorize("a", "tts", 1) == "allow"
    assert await auth_mod.authorize("a", "tts", 1) == "allow"
    # No positive caching — admin is consulted every time so a revoke is instant.
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_authorize_serves_recent_stale_on_error(monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def ok(account, service, iat, jti=None):
        return "allow"

    monkeypatch.setattr(auth_mod, "_fetch_decision", ok)
    assert await auth_mod.authorize("a", "tts", 1) == "allow"

    async def boom(account, service, iat, jti=None):
        raise RuntimeError("admin down")

    monkeypatch.setattr(auth_mod, "_fetch_decision", boom)
    # Within the stale window the last good decision is served.
    assert await auth_mod.authorize("a", "tts", 1) == "allow"


@pytest.mark.asyncio
async def test_authorize_denies_when_no_cache_and_error(monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def boom(account, service, iat, jti=None):
        raise RuntimeError("admin down")

    monkeypatch.setattr(auth_mod, "_fetch_decision", boom)
    assert await auth_mod.authorize("nobody", "tts", 1) == "deny"


@pytest.mark.asyncio
async def test_authorize_stale_expires(monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def ok(account, service, iat, jti=None):
        return "allow"

    monkeypatch.setattr(auth_mod, "_fetch_decision", ok)
    assert await auth_mod.authorize("a", "tts", 1) == "allow"

    # Age the remembered value past the stale window.
    dec, _ = auth_mod._authz_last_good["a:tts:1:"]
    auth_mod._authz_last_good["a:tts:1:"] = (dec, time.monotonic() - (auth_mod._AUTHZ_STALE_MAX + 1))

    async def boom(account, service, iat, jti=None):
        raise RuntimeError("admin down")

    monkeypatch.setattr(auth_mod, "_fetch_decision", boom)
    assert await auth_mod.authorize("a", "tts", 1) == "deny"


@pytest.mark.asyncio
async def test_authorize_skipped_when_url_unset(monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "")
    assert await auth_mod.authorize("whoever", "tts", 1) == "allow"


def _api_token(sub: str, jti: str = "tok1", iat: int | None = 1) -> str:
    payload: dict = {"sub": sub, "scope": "api", "svc": "tts", "jti": jti}
    if iat is not None:
        payload["iat"] = iat
    return jwt.encode(payload, SECRET, algorithm="HS256")


def test_api_token_allow_returns_200(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")
    seen = {}

    async def fake(account, service, iat, jti=None):
        seen["jti"] = jti
        return "allow"

    monkeypatch.setattr(auth_mod, "_fetch_decision", fake)
    r = client.get("/protected", headers={"Authorization": f"Bearer {_api_token('acct-x')}"})
    assert r.status_code == 200
    assert seen["jti"] == "tok1"


def test_api_token_revoked_returns_401(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def fake(account, service, iat, jti=None):
        return "reauth"  # admin reports the token revoked/missing

    monkeypatch.setattr(auth_mod, "_fetch_decision", fake)
    r = client.get("/protected", headers={"Authorization": f"Bearer {_api_token('acct-x')}"})
    assert r.status_code == 401


def test_non_api_jwt_bearer_is_not_accepted_as_token(client, monkeypatch):
    # A plain SSO-style JWT (no scope=api) sent as Bearer must NOT authenticate
    # via the API-token path; with no cookie it falls through to 401.
    monkeypatch.setattr(settings, "admin_authz_url", "")
    plain = jwt.encode({"sub": "acct-x"}, SECRET, algorithm="HS256")
    r = client.get("/protected", headers={"Authorization": f"Bearer {plain}"})
    assert r.status_code == 401
