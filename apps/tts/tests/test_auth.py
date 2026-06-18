"""Unit tests for the tts auth layer (Bearer key + SSO cookie + per-service authz).

These run fully in-process against a tiny FastAPI app wired to verify_auth, so
they exercise the real dependency without a deployed backend. Required settings
env vars are set in conftest before the app package is imported.
"""
from __future__ import annotations

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


def _sso_cookie(sub: str) -> str:
    return jwt.encode({"sub": sub}, SECRET, algorithm="HS256")


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


def test_sso_owner_still_works(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "")
    r = client.get("/protected", cookies={"nz_session": _sso_cookie("owner")})
    assert r.status_code == 200


def test_invalid_sso_signature_401(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "")
    bad = jwt.encode({"sub": "owner"}, "wrong-secret", algorithm="HS256")
    r = client.get("/protected", cookies={"nz_session": bad})
    assert r.status_code == 401


# --------------------------------------------------------------------------
# SSO cookie path with authz enabled — account must be authorized for "tts".
# --------------------------------------------------------------------------
def test_sso_without_tts_access_403(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def fake_fetch(account, service):
        return False

    monkeypatch.setattr(auth_mod, "_fetch_authz", fake_fetch)
    r = client.get("/protected", cookies={"nz_session": _sso_cookie("acct-no-tts")})
    assert r.status_code == 403
    assert "tts access not enabled" in r.json()["detail"]


def test_sso_with_tts_access_allowed(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def fake_fetch(account, service):
        assert service == "tts"
        return True

    monkeypatch.setattr(auth_mod, "_fetch_authz", fake_fetch)
    r = client.get("/protected", cookies={"nz_session": _sso_cookie("acct-tts")})
    assert r.status_code == 200


# --------------------------------------------------------------------------
# Authz caching / stale-on-error behavior.
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_authz_cache_hit_avoids_refetch(monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")
    calls = {"n": 0}

    async def fake_fetch(account, service):
        calls["n"] += 1
        return True

    monkeypatch.setattr(auth_mod, "_fetch_authz", fake_fetch)
    assert await auth_mod.is_authorized("a", "tts") is True
    assert await auth_mod.is_authorized("a", "tts") is True
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_authz_serves_recent_stale_on_error(monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    # Prime the cache with an allowed=True value.
    async def ok(account, service):
        return True

    monkeypatch.setattr(auth_mod, "_fetch_authz", ok)
    assert await auth_mod.is_authorized("a", "tts") is True

    # Force the TTL to have elapsed but stay within the stale window.
    allowed, fetched_at = auth_mod._authz_cache["a:tts"]
    auth_mod._authz_cache["a:tts"] = (allowed, fetched_at - (auth_mod._AUTHZ_TTL + 1))

    async def boom(account, service):
        raise RuntimeError("admin down")

    monkeypatch.setattr(auth_mod, "_fetch_authz", boom)
    assert await auth_mod.is_authorized("a", "tts") is True


@pytest.mark.asyncio
async def test_authz_denies_when_no_cache_and_error(monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "https://admin.example")

    async def boom(account, service):
        raise RuntimeError("admin down")

    monkeypatch.setattr(auth_mod, "_fetch_authz", boom)
    assert await auth_mod.is_authorized("nobody", "tts") is False


@pytest.mark.asyncio
async def test_authz_skipped_when_url_unset(monkeypatch):
    monkeypatch.setattr(settings, "admin_authz_url", "")
    assert await auth_mod.is_authorized("whoever", "tts") is True
