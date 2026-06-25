"""Unit tests for Groq error mapping + credential readiness.

These pin the behaviour behind the recurring "502 when a recording finishes"
outage: a rejected GROQ_API_KEY must surface as an honest 503 (service
misconfigured), not an opaque 502 that reads like a proxy fault.
"""
from __future__ import annotations

import httpx
import pytest
from groq import (
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
)

import backend.app.groq_client as gc
from backend.app.groq_client import map_upstream_error, verify_credentials


def _status_err(cls, code: int):
    req = httpx.Request("POST", "https://api.groq.com/openai/v1/audio/transcriptions")
    resp = httpx.Response(code, request=req, json={"error": {"message": "boom"}})
    return cls("boom", response=resp, body={"error": {"message": "boom"}})


# ---------------------------------------------------------------------------
# map_upstream_error — the status code a client sees per upstream failure.
# ---------------------------------------------------------------------------
def test_rejected_key_maps_to_503_not_502():
    status, detail = map_upstream_error(_status_err(AuthenticationError, 401), action="Transcription")
    assert status == 503, "a rejected key is a server misconfig (503), not a gateway fault (502)"
    assert "GROQ_API_KEY" in detail


def test_permission_denied_maps_to_503():
    status, _ = map_upstream_error(_status_err(PermissionDeniedError, 403), action="Transcription")
    assert status == 503


def test_rate_limit_maps_to_429():
    status, _ = map_upstream_error(_status_err(RateLimitError, 429), action="Transcription")
    assert status == 429


def test_bad_request_maps_to_400():
    status, _ = map_upstream_error(_status_err(BadRequestError, 400), action="Transcription")
    assert status == 400


def test_unknown_error_falls_back_to_502():
    status, _ = map_upstream_error(RuntimeError("???"), action="Transcription")
    assert status == 502


# ---------------------------------------------------------------------------
# verify_credentials — cached readiness probe used by /ready + startup log.
# ---------------------------------------------------------------------------
class _FakeResp:
    def __init__(self, code: int):
        self.status_code = code


class _FakeClient:
    def __init__(self, code: int):
        self._code = code

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False

    async def get(self, _url, headers=None):
        return _FakeResp(self._code)


@pytest.mark.asyncio
async def test_verify_credentials_ok(monkeypatch):
    gc._cred_cache = None
    monkeypatch.setattr(gc.httpx, "AsyncClient", lambda *a, **k: _FakeClient(200))
    ok, detail = await verify_credentials(force=True)
    assert ok is True
    assert "accepted" in detail.lower()


@pytest.mark.asyncio
async def test_verify_credentials_rejected(monkeypatch):
    gc._cred_cache = None
    monkeypatch.setattr(gc.httpx, "AsyncClient", lambda *a, **k: _FakeClient(401))
    ok, detail = await verify_credentials(force=True)
    assert ok is False
    assert "rejected" in detail.lower()


@pytest.mark.asyncio
async def test_verify_credentials_is_cached(monkeypatch):
    gc._cred_cache = None
    calls = {"n": 0}

    class _Counting(_FakeClient):
        async def get(self, _url, headers=None):
            calls["n"] += 1
            return _FakeResp(200)

    monkeypatch.setattr(gc.httpx, "AsyncClient", lambda *a, **k: _Counting(200))
    await verify_credentials(force=True)
    await verify_credentials()  # within TTL → served from cache, no second call
    assert calls["n"] == 1


# ----- transcript marker guard ---------------------------------------------

def test_strip_transcript_markers_removes_leaked_fence():
    # If a chat model echoes the <transcript> fence we wrap input in, those
    # literal tags must be scrubbed from the stored/returned text.
    leaked = "<transcript>\nПривет, как дела?\n</transcript>"
    assert gc._strip_transcript_markers(leaked) == "Привет, как дела?"


def test_strip_transcript_markers_noop_on_clean_text():
    clean = "Обычный транскрипт без всяких тегов."
    assert gc._strip_transcript_markers(clean) == clean
