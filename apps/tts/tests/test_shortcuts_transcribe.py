from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import TranscriptionResponse

AUTH = {"Authorization": "Bearer test-amethyst-key"}


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def fake_response(text: str = "hello from shortcut") -> TranscriptionResponse:
    return TranscriptionResponse(
        id="01HSHORTCUTTEST0000000000000",
        text=text,
        text_raw=text,
        text_clean=None,
        text_polished=None,
        language="en",
        duration_s=1.0,
        source="action_button",
        whisper_model="test-whisper",
        cleanup_model=None,
        cleanup_mode=None,
        polish_model=None,
        polish_mode=None,
        text_translated=None,
        translate_lang=None,
        translate_source=None,
        translate_model=None,
        translate_ms=None,
        whisper_ms=1,
        cleanup_ms=None,
        polish_ms=None,
        audio_path=None,
        audio_bytes=None,
        audio_format=None,
        created_at=int(time.time()),
    )


def test_shortcut_raw_route_accepts_file_body(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    async def fake_transcribe_bytes(**kwargs):
        assert kwargs["data"] == b"fake audio bytes"
        assert kwargs["filename"] == "shortcut.m4a"
        assert kwargs["content_type"] == "audio/mp4"
        assert kwargs["source"] == "action_button"
        assert kwargs["keep_audio"] is False
        return fake_response()

    monkeypatch.setattr("backend.app.routes.transcribe._transcribe_bytes", fake_transcribe_bytes)

    r = client.post(
        "/api/v1/shortcuts/transcribe?source=action_button&keep_audio=false",
        headers={**AUTH, "Content-Type": "audio/mp4"},
        content=b"fake audio bytes",
    )

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    assert r.json()["text"] == "hello from shortcut"


def test_transcribe_file_alias_accepts_same_raw_body(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    async def fake_transcribe_bytes(**kwargs):
        return fake_response("alias ok")

    monkeypatch.setattr("backend.app.routes.transcribe._transcribe_bytes", fake_transcribe_bytes)

    r = client.post(
        "/api/v1/transcribe/file",
        headers={**AUTH, "Content-Type": "audio/mp4"},
        content=b"fake audio bytes",
    )

    assert r.status_code == 200
    assert r.json()["text"] == "alias ok"


def test_shortcut_raw_route_empty_body_returns_text_error(client: TestClient):
    r = client.post(
        "/api/v1/shortcuts/transcribe",
        headers={**AUTH, "Content-Type": "audio/mp4"},
        content=b"",
    )

    assert r.status_code == 400
    assert r.headers["content-type"].startswith("application/json")
    assert "text" in r.json()
    assert "empty" in r.json()["text"].lower()


def test_shortcut_raw_route_missing_auth_returns_text_error(client: TestClient):
    r = client.post(
        "/api/v1/shortcuts/transcribe",
        headers={"Content-Type": "audio/mp4"},
        content=b"fake audio bytes",
    )

    assert r.status_code == 401
    assert r.headers["content-type"].startswith("application/json")
    assert "text" in r.json()
    assert "authorization" in r.json()["text"].lower() or "unauthorized" in r.json()["text"].lower()


def test_legacy_transcribe_route_errors_keep_detail_and_add_text(client: TestClient):
    r = client.post("/api/v1/transcribe")

    assert r.status_code in {401, 422}
    body = r.json()
    assert "detail" in body
    assert "text" in body


def test_shortcut_file_alias_missing_auth_returns_text_error(client: TestClient):
    r = client.post(
        "/api/v1/transcribe/file",
        headers={"Content-Type": "audio/mp4"},
        content=b"fake audio bytes",
    )

    assert r.status_code == 401
    assert "text" in r.json()


def test_shortcut_route_validation_error_returns_text_error(client: TestClient):
    r = client.post(
        "/api/v1/shortcuts/transcribe?keep_audio=not-a-bool",
        headers={**AUTH, "Content-Type": "audio/mp4"},
        content=b"fake audio bytes",
    )

    assert r.status_code == 422
    assert "text" in r.json()
    assert r.json()["error"] == "validation"
