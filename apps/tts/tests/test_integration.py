"""
Integration tests against the live Amethyst deployment.

Run from project root:
    AMETHYST_BASE_URL=https://negativezero.one/vtt-transcriber \
    AMETHYST_API_KEY=<key> \
    uv run pytest tests/test_integration.py -v

The /transcribe round-trip test makes one real Groq Whisper call (~$0.0002).
Skip with -k 'not silent_audio' if you want to avoid any backend cost.
"""
from __future__ import annotations

import io
import os
import struct
import wave

import httpx
import pytest

BASE_URL = os.getenv(
    "AMETHYST_BASE_URL",
    "https://negativezero.one/services/amethyst",
)
# No key is baked in — committing a Bearer key leaks it in git history. Supply a
# real one via AMETHYST_API_KEY to run these live tests; otherwise they skip.
# (conftest sets a dummy "test-amethyst-key" for the in-process unit tests; that
# dummy is treated as "not configured" here so we never fire live calls with it.)
API_KEY = os.getenv("AMETHYST_API_KEY", "")
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
APEX = "https://" + BASE_URL.split("//", 1)[1].split("/", 1)[0]

pytestmark = pytest.mark.skipif(
    not API_KEY or API_KEY == "test-amethyst-key",
    reason="live integration tests need a real AMETHYST_API_KEY (+ optional AMETHYST_BASE_URL)",
)


@pytest.fixture(scope="session")
def client():
    with httpx.Client(base_url=BASE_URL, timeout=60) as c:
        yield c


@pytest.fixture(scope="session")
def silent_wav() -> bytes:
    """0.5 s of near-silence at 16 kHz mono — minimal cost when sent to Whisper."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        n = 16000 // 2
        for i in range(n):
            v = (i % 7) - 3  # tiny non-zero perturbation
            w.writeframesraw(struct.pack("<h", v))
    return buf.getvalue()


# ============================================================================
# Health
# ============================================================================
class TestHealth:
    def test_health_no_auth(self, client):
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "version" in body


# ============================================================================
# Authentication
# ============================================================================
class TestAuth:
    def test_no_auth_header_returns_401(self, client):
        r = client.get("/api/v1/transcriptions")
        assert r.status_code == 401
        assert "WWW-Authenticate" in r.headers

    def test_malformed_auth_header_returns_401(self, client):
        r = client.get("/api/v1/transcriptions", headers={"Authorization": "NotBearer xxx"})
        assert r.status_code == 401

    def test_wrong_key_returns_401(self, client):
        r = client.get(
            "/api/v1/transcriptions",
            headers={"Authorization": "Bearer wrongwrongwrongwrongwrongwrong"},
        )
        assert r.status_code == 401

    def test_correct_key_returns_200(self, client):
        r = client.get("/api/v1/transcriptions", headers=HEADERS)
        assert r.status_code == 200

    def test_glossary_requires_auth(self, client):
        r = client.get("/api/v1/glossary")
        assert r.status_code == 401

    def test_transcribe_requires_auth(self, client):
        r = client.post(
            "/api/v1/transcribe",
            files={"file": ("x.wav", b"\x00" * 100, "audio/wav")},
        )
        assert r.status_code == 401


# ============================================================================
# Glossary CRUD
# ============================================================================
class TestGlossary:
    def test_get_returns_builtin(self, client):
        r = client.get("/api/v1/glossary", headers=HEADERS)
        assert r.status_code == 200
        body = r.json()
        assert len(body["core"]) >= 80, f"core only has {len(body['core'])}"
        assert len(body["extended"]) >= 300
        # Spot-check that key tech terms are present
        assert "Kubernetes" in body["core"]
        assert "Docker" in body["core"]

    def test_patch_persists_and_dedupes(self, client):
        marker = f"_test_{os.urandom(4).hex()}"
        r = client.patch(
            "/api/v1/glossary",
            headers=HEADERS,
            json={"personal": [marker, marker, "  ", marker, "OtherTerm"]},
        )
        assert r.status_code == 200
        body = r.json()
        # Should be deduplicated and trimmed
        assert body["personal"].count(marker) == 1
        assert "  " not in body["personal"]

        # Reload and verify persistence
        r2 = client.get("/api/v1/glossary", headers=HEADERS)
        assert marker in r2.json()["personal"]

        # Cleanup
        survivors = [t for t in r2.json()["personal"] if not t.startswith("_test_")]
        client.patch("/api/v1/glossary", headers=HEADERS, json={"personal": survivors})

    def test_anti_correct_persists(self, client):
        marker = f"_anti_{os.urandom(4).hex()}"
        r = client.patch(
            "/api/v1/glossary",
            headers=HEADERS,
            json={"anti_correct": [marker]},
        )
        assert r.status_code == 200
        assert marker in r.json()["anti_correct"]
        client.patch("/api/v1/glossary", headers=HEADERS, json={"anti_correct": []})


# ============================================================================
# Transcribe edge cases (no Groq call)
# ============================================================================
class TestTranscribeEdges:
    def test_empty_file_400(self, client):
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            files={"file": ("empty.wav", b"", "audio/wav")},
        )
        assert r.status_code == 400

    def test_oversized_413(self, client):
        # App enforces 25 MiB; send 26 MiB to exceed
        oversize = b"X" * (26 * 1024 * 1024)
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            files={"file": ("big.wav", oversize, "audio/wav")},
        )
        # Could be 413 from FastAPI app, 413 from nginx, or 400 if Groq rejected
        # Most likely nginx 413 since limit is 30 MB and we sent 26 MB plus form overhead
        assert r.status_code in (413, 400)

    def test_missing_file_field(self, client):
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            data={"source": "test"},
        )
        assert r.status_code == 422  # FastAPI validation error


# ============================================================================
# Transcribe round-trip (one real Groq call)
# ============================================================================
class TestTranscribeRoundTrip:
    def test_silent_audio_no_cleanup(self, client, silent_wav):
        """Whisper-only path. Cleanup disabled to skip the LLM call."""
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            files={"file": ("silent.wav", silent_wav, "audio/wav")},
            data={"source": "pytest", "language": "en", "cleanup": "false"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body
        assert "text_raw" in body
        assert body["whisper_model"]
        assert body["cleanup_model"] is None  # cleanup was off

        tid = body["id"]
        # Verify it appears in history
        r2 = client.get(f"/api/v1/transcriptions/{tid}", headers=HEADERS)
        assert r2.status_code == 200
        assert r2.json()["id"] == tid

        # Cleanup test data
        rd = client.delete(f"/api/v1/transcriptions/{tid}", headers=HEADERS)
        assert rd.status_code == 200


# ============================================================================
# 404 & not-found behaviors
# ============================================================================
class TestNotFound:
    def test_unknown_endpoint(self, client):
        r = client.get("/api/v1/nonexistent", headers=HEADERS)
        assert r.status_code == 404

    def test_unknown_transcription_id(self, client):
        r = client.get("/api/v1/transcriptions/01ZZZZNOTREAL", headers=HEADERS)
        assert r.status_code == 404

    def test_delete_unknown(self, client):
        r = client.delete("/api/v1/transcriptions/01ZZZZNOTREAL", headers=HEADERS)
        assert r.status_code == 404


# ============================================================================
# Static assets (PWA)
# ============================================================================
class TestStatic:
    @pytest.mark.parametrize(
        "path,expected_substr,min_size",
        [
            ("/", b"<title>Amethyst", 5_000),
            ("/app.js", b"apiUrl", 5_000),
            ("/styles.css", b"--accent", 5_000),
            ("/manifest.webmanifest", b"Amethyst", 100),
            ("/sw.js", b"amethyst-shell", 500),
            ("/icon.svg", b"<svg", 200),
        ],
    )
    def test_asset(self, client, path, expected_substr, min_size):
        r = client.get(path)
        assert r.status_code == 200, path
        assert len(r.content) >= min_size, path
        assert expected_substr in r.content, path


# ============================================================================
# nginx-level routing
# ============================================================================
class TestRouting:
    def test_apex_returns_404(self):
        r = httpx.get(APEX + "/")
        assert r.status_code == 404

    def test_api_at_apex_returns_404(self):
        r = httpx.get(APEX + "/api/v1/health")
        assert r.status_code == 404

    def test_subpath_no_trailing_slash_redirects(self):
        r = httpx.get(APEX + "/vtt-transcriber", follow_redirects=False)
        assert r.status_code == 301
        assert "/vtt-transcriber/" in r.headers["location"]


# ============================================================================
# OpenAPI docs exposure (will be flagged in security audit)
# ============================================================================
class TestDocsExposure:
    """Docs endpoints (/openapi.json, /docs, /redoc) are disabled in
    production by default to avoid leaking the API surface to anonymous
    callers. Re-enable for local dev with EXPOSE_API_DOCS=true."""

    def test_openapi_disabled(self, client):
        r = client.get("/openapi.json")
        assert r.status_code == 404, "openapi.json should be disabled in prod"

    def test_swagger_docs_disabled(self, client):
        r = client.get("/docs")
        assert r.status_code == 404, "/docs should be disabled in prod"

    def test_redoc_disabled(self, client):
        r = client.get("/redoc")
        assert r.status_code == 404, "/redoc should be disabled in prod"


# ============================================================================
# Notes — CRUD
# ============================================================================
class TestNotesCRUD:
    def test_create_get_update_delete(self, client):
        # Create with explicit settings
        r = client.post(
            "/api/v1/notes",
            headers=HEADERS,
            json={
                "title": "Test note",
                "body": "Hello world",
                "cleanup_mode": "standard",
                "polish_mode": "off",
                "language": "auto",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        nid = body["id"]
        assert body["title"] == "Test note"
        assert body["body"] == "Hello world"
        assert body["cleanup_mode"] == "standard"
        assert body["polish_mode"] == "off"
        assert body["created_at"] == body["updated_at"]

        # Get
        rg = client.get(f"/api/v1/notes/{nid}", headers=HEADERS)
        assert rg.status_code == 200
        assert rg.json()["id"] == nid

        # Patch — change body and polish mode
        rp = client.patch(
            f"/api/v1/notes/{nid}",
            headers=HEADERS,
            json={"body": "Updated content", "polish_mode": "light"},
        )
        assert rp.status_code == 200
        b = rp.json()
        assert b["body"] == "Updated content"
        assert b["polish_mode"] == "light"
        assert b["title"] == "Test note"  # untouched
        assert b["updated_at"] >= b["created_at"]

        # List should include the note
        rl = client.get("/api/v1/notes", headers=HEADERS)
        assert rl.status_code == 200
        ids = [it["id"] for it in rl.json()["items"]]
        assert nid in ids

        # Delete
        rd = client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)
        assert rd.status_code == 200

        # Get → 404
        r404 = client.get(f"/api/v1/notes/{nid}", headers=HEADERS)
        assert r404.status_code == 404

    def test_create_with_defaults(self, client):
        r = client.post("/api/v1/notes", headers=HEADERS, json={})
        assert r.status_code == 200
        b = r.json()
        assert b["title"] == ""
        assert b["body"] == ""
        assert b["cleanup_mode"] == "off"
        assert b["polish_mode"] == "off"
        assert b["language"] == "auto"
        client.delete(f"/api/v1/notes/{b['id']}", headers=HEADERS)

    def test_patch_unknown_404(self, client):
        r = client.patch(
            "/api/v1/notes/01ZZZZNOTREAL",
            headers=HEADERS,
            json={"body": "x"},
        )
        assert r.status_code == 404

    def test_dictate_into_note(self, client, silent_wav):
        """Round-trip: create → dictate (silent audio) → assert response shape.
        Silent audio normally yields empty/very-short text; we just check the
        endpoint accepts the upload, runs the pipeline, and returns the
        documented schema."""
        r = client.post(
            "/api/v1/notes",
            headers=HEADERS,
            json={"cleanup_mode": "off", "polish_mode": "off"},
        )
        assert r.status_code == 200
        nid = r.json()["id"]

        try:
            rd = client.post(
                f"/api/v1/notes/{nid}/dictate",
                headers=HEADERS,
                files={"file": ("note.wav", silent_wav, "audio/wav")},
            )
            assert rd.status_code == 200, rd.text
            body = rd.json()
            assert "text" in body
            assert "text_raw" in body
            assert "whisper_ms" in body
            assert isinstance(body["whisper_ms"], int)
            # cleanup/polish were off, so those should be absent
            assert body["text_clean"] is None
            assert body["text_polished"] is None
        finally:
            client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)


# ============================================================================
# Notes — FTS5 search (T-005)
# ============================================================================
class TestNotesSearch:
    """FTS5 search across title + body, with the unicode61 + remove_diacritics
    tokenizer. Each test creates a note with a unique marker and cleans up,
    so concurrent runs against prod don't collide."""

    def _make(self, client, title: str, body: str) -> str:
        r = client.post("/api/v1/notes", headers=HEADERS, json={"title": title, "body": body})
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _ids_for(self, client, q: str) -> list[str]:
        r = client.get("/api/v1/notes", headers=HEADERS, params={"q": q, "limit": 500})
        assert r.status_code == 200, r.text
        return [it["id"] for it in r.json()["items"]]

    def test_search_matches_title_token(self, client):
        marker = f"zzmarktitle{os.urandom(4).hex()}"
        nid = self._make(client, f"Project {marker} kickoff", "Body text")
        try:
            assert nid in self._ids_for(client, marker)
        finally:
            client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)

    def test_search_matches_body_token(self, client):
        marker = f"zzmarkbody{os.urandom(4).hex()}"
        nid = self._make(client, "Title", f"first paragraph then {marker} closing line")
        try:
            assert nid in self._ids_for(client, marker)
        finally:
            client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)

    def test_search_case_insensitive(self, client):
        marker = f"zzcase{os.urandom(4).hex()}"
        nid = self._make(client, f"All-Caps {marker.upper()}", "")
        try:
            # Lowercase query should still hit the upper-cased title.
            assert nid in self._ids_for(client, marker)
            assert nid in self._ids_for(client, marker.upper())
        finally:
            client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)

    def test_search_multi_token_implicit_and(self, client):
        a = f"zzfoo{os.urandom(4).hex()}"
        b = f"zzbar{os.urandom(4).hex()}"
        nid_both = self._make(client, f"{a} title", f"{b} body")
        nid_a    = self._make(client, f"{a} only", "")
        try:
            both_only = self._ids_for(client, f"{a} {b}")
            assert nid_both in both_only
            assert nid_a not in both_only, "two-token query must AND, not OR"
        finally:
            client.delete(f"/api/v1/notes/{nid_both}", headers=HEADERS)
            client.delete(f"/api/v1/notes/{nid_a}", headers=HEADERS)

    def test_search_diacritics_folded(self, client):
        marker = f"zzdia{os.urandom(4).hex()}"
        nid = self._make(client, f"Café résumé {marker}", "")
        try:
            # Tokenizer is unicode61 with remove_diacritics 2 — both directions match.
            assert nid in self._ids_for(client, "cafe")
            assert nid in self._ids_for(client, "resume")
        finally:
            client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)

    def test_search_cyrillic(self, client):
        marker = f"zzcyr{os.urandom(4).hex()}"
        # Russian content end-to-end, including a unique marker in the title.
        nid = self._make(client, f"Заметка {marker}", "Тест проверки полнотекстового поиска")
        try:
            assert nid in self._ids_for(client, "заметка")
            assert nid in self._ids_for(client, "ЗАМЕТКА")  # case-fold
            assert nid in self._ids_for(client, "проверки")
        finally:
            client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)

    def test_search_special_chars_dont_crash(self, client):
        """Stray FTS5 syntax characters (`"`, `*`, `(`, `:`, `+`) must not 500.
        Token-quoting in _build_fts_query escapes them safely."""
        marker = f"zzspecial{os.urandom(4).hex()}"
        nid = self._make(client, f"weird {marker}", "")
        try:
            # All of these would raise a syntax error if passed to MATCH unwrapped.
            for q in (f'{marker} "', f'{marker} *', f'{marker} (', f'{marker} :', f'{marker} +'):
                r = client.get("/api/v1/notes", headers=HEADERS, params={"q": q})
                assert r.status_code == 200, f"crashed on {q!r}: {r.text}"
        finally:
            client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)

    def test_search_whitespace_only_q_returns_unfiltered(self, client):
        """An all-whitespace q is treated as no filter — list returns recent
        notes ordered by updated_at, matching the no-q behaviour."""
        marker = f"zzws{os.urandom(4).hex()}"
        nid = self._make(client, f"ws-test {marker}", "")
        try:
            r = client.get("/api/v1/notes", headers=HEADERS, params={"q": "   "})
            assert r.status_code == 200
            # New note should be at the top of the list.
            ids = [it["id"] for it in r.json()["items"]]
            assert nid in ids
        finally:
            client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)

    def test_search_no_match_empty_list(self, client):
        r = client.get(
            "/api/v1/notes",
            headers=HEADERS,
            params={"q": "zznoexist" + os.urandom(8).hex()},
        )
        assert r.status_code == 200
        assert r.json()["items"] == []

    def test_search_reflects_updates(self, client):
        """Update triggers re-index the FTS row, so a search that matched the
        original body should miss after the body changes (and vice-versa)."""
        old = f"zzold{os.urandom(4).hex()}"
        new = f"zznew{os.urandom(4).hex()}"
        nid = self._make(client, "", f"contents include {old}")
        try:
            assert nid in self._ids_for(client, old)
            r = client.patch(
                f"/api/v1/notes/{nid}",
                headers=HEADERS,
                json={"body": f"contents include {new}"},
            )
            assert r.status_code == 200
            assert nid in self._ids_for(client, new)
            assert nid not in self._ids_for(client, old)
        finally:
            client.delete(f"/api/v1/notes/{nid}", headers=HEADERS)


# ============================================================================
# Polish + Re-transcribe (smoke; cheap because we polish a tiny string and
# re-transcribe the same silent fixture)
# ============================================================================
class TestPolishAndRetranscribe:
    def test_polish_modes(self, client, silent_wav):
        # Create a record we can polish — use the silent_wav round-trip.
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            files={"file": ("silent.wav", silent_wav, "audio/wav")},
            data={"cleanup": "false", "source": "test_polish"},
        )
        assert r.status_code == 200, r.text
        tid = r.json()["id"]

        try:
            for mode in ("light", "standard", "strong"):
                rp = client.post(
                    f"/api/v1/transcriptions/{tid}/polish",
                    headers=HEADERS,
                    params={"mode": mode},
                )
                assert rp.status_code == 200, f"{mode}: {rp.text}"
                body = rp.json()
                assert body["polish_mode"] == mode
                assert body["text_polished"] is not None
                assert body["polish_ms"] is not None
                # The "text" field should now reflect the polished version
                assert body["text"] == body["text_polished"]
        finally:
            client.delete(f"/api/v1/transcriptions/{tid}", headers=HEADERS)

    def test_retranscribe(self, client, silent_wav):
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            files={"file": ("silent.wav", silent_wav, "audio/wav")},
            data={"cleanup": "false", "source": "test_retranscribe"},
        )
        assert r.status_code == 200
        tid = r.json()["id"]
        original_model = r.json()["whisper_model"]

        try:
            rr = client.post(
                f"/api/v1/transcriptions/{tid}/retranscribe",
                headers=HEADERS,
            )
            assert rr.status_code == 200, rr.text
            body = rr.json()
            # Model should now be the accurate one (whisper-large-v3 by default)
            assert body["whisper_model"] != "whisper-large-v3-turbo" or original_model != "whisper-large-v3-turbo"
            # Cleanup/polish derived state should be reset
            assert body["text_clean"] is None
            assert body["text_polished"] is None
        finally:
            client.delete(f"/api/v1/transcriptions/{tid}", headers=HEADERS)

    def test_retranscribe_404_when_audio_purged(self, client):
        """If a record has no audio_path (e.g., live mode kept_audio=false),
        re-transcribe should return 410 Gone, not 500."""
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            files={"file": ("silent.wav", _silent_minimal_wav(), "audio/wav")},
            data={"cleanup": "false", "keep_audio": "false", "source": "test_purge"},
        )
        assert r.status_code == 200
        tid = r.json()["id"]
        try:
            assert r.json()["audio_path"] is None
            rr = client.post(
                f"/api/v1/transcriptions/{tid}/retranscribe",
                headers=HEADERS,
            )
            assert rr.status_code == 410
        finally:
            client.delete(f"/api/v1/transcriptions/{tid}", headers=HEADERS)


def _silent_minimal_wav() -> bytes:
    """Tiny silent WAV — 0.25s, 8 kHz mono. Used where we just need *any*
    valid audio that Whisper will accept without bursting our quota."""
    import io
    import wave

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframesraw(b"\x00\x00" * (8000 // 4))
    return buf.getvalue()


# ============================================================================
# Polish queue — chunked background processing for transcripts that exceed
# a single LLM round-trip's TPM ceiling. The endpoint creates a Note with
# queue_status='processing'; a server-side worker tick fills it in chunk-
# by-chunk over the following minutes.
# ============================================================================
class TestPolishQueue:
    def test_404_on_unknown_transcription(self, client):
        r = client.post(
            "/api/v1/transcriptions/01ZZZZNOTREAL/polish-queue",
            headers=HEADERS,
            params={"mode": "strong"},
        )
        assert r.status_code == 404

    def test_creates_queued_note(self, client, silent_wav):
        # Round-trip: transcribe → polish-queue. The queued note should have
        # the right shape (queue_status, total_chunks > 0, body empty until
        # worker fills it in).
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            files={"file": ("silent.wav", silent_wav, "audio/wav")},
            data={"cleanup": "false", "source": "test_polish_queue"},
        )
        assert r.status_code == 200
        tid = r.json()["id"]

        try:
            rq = client.post(
                f"/api/v1/transcriptions/{tid}/polish-queue",
                headers=HEADERS,
                params={"mode": "strong"},
            )
            assert rq.status_code == 202, rq.text
            body = rq.json()
            assert body["queued"] is True
            assert body["total_chunks"] >= 1
            note_id = body["note_id"]

            # Note should appear in queue=processing list immediately.
            rl = client.get(
                "/api/v1/notes",
                headers=HEADERS,
                params={"queue": "processing", "limit": 20},
            )
            assert rl.status_code == 200
            ids = [it["id"] for it in rl.json()["items"]]
            assert note_id in ids

            # Inspect the note directly.
            rn = client.get(f"/api/v1/notes/{note_id}", headers=HEADERS)
            assert rn.status_code == 200
            n = rn.json()
            assert n["queue_status"] in ("processing", "done")
            assert n["queue_kind"] == "polish"
            assert n["queue_total_chunks"] >= 1
            assert n["title"].startswith("Polish:")

            # Cleanup — delete the queued note (cascades to note_queue rows).
            client.delete(f"/api/v1/notes/{note_id}", headers=HEADERS)
        finally:
            client.delete(f"/api/v1/transcriptions/{tid}", headers=HEADERS)

    def test_queued_note_filtered_out_of_idle_list(self, client, silent_wav):
        """A note with queue_status='processing' must NOT show up in
        ?queue=idle, otherwise it'd appear in the main Notes list and
        double up with the Queued section in the UI."""
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            files={"file": ("silent.wav", silent_wav, "audio/wav")},
            data={"cleanup": "false", "source": "test_queue_filter"},
        )
        tid = r.json()["id"]
        try:
            rq = client.post(
                f"/api/v1/transcriptions/{tid}/polish-queue",
                headers=HEADERS,
                params={"mode": "strong"},
            )
            note_id = rq.json()["note_id"]

            # While the note is still processing it should NOT be in
            # ?queue=idle. (Race: the worker tick runs every 30 s, so we
            # check immediately after enqueue when status is still
            # 'processing'. If we're unlucky and the worker beats us, the
            # note will be in 'done' which IS in idle — accept either case
            # but verify they're mutually exclusive.)
            rn = client.get(f"/api/v1/notes/{note_id}", headers=HEADERS)
            status = rn.json()["queue_status"]

            ri = client.get(
                "/api/v1/notes",
                headers=HEADERS,
                params={"queue": "idle", "limit": 100},
            )
            idle_ids = [it["id"] for it in ri.json()["items"]]

            if status == "processing":
                assert note_id not in idle_ids
            elif status == "done":
                assert note_id in idle_ids
            else:
                pytest.fail(f"unexpected status: {status}")

            client.delete(f"/api/v1/notes/{note_id}", headers=HEADERS)
        finally:
            client.delete(f"/api/v1/transcriptions/{tid}", headers=HEADERS)

    def test_invalid_polish_mode_rejected(self, client, silent_wav):
        r = client.post(
            "/api/v1/transcribe",
            headers=HEADERS,
            files={"file": ("silent.wav", silent_wav, "audio/wav")},
            data={"cleanup": "false", "source": "test_queue_modes"},
        )
        tid = r.json()["id"]
        try:
            # mode must be one of light / standard / strong.
            rq = client.post(
                f"/api/v1/transcriptions/{tid}/polish-queue",
                headers=HEADERS,
                params={"mode": "totally-invalid"},
            )
            assert rq.status_code == 422, rq.text  # FastAPI Pydantic validation
        finally:
            client.delete(f"/api/v1/transcriptions/{tid}", headers=HEADERS)
