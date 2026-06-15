import asyncio
import logging
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from ..auth import verify_auth
from ..config import settings
from ..db import get_db
from ..fts import build_fts_query
from ..glossary import load_glossary
from ..groq_client import cleanup as groq_cleanup
from ..groq_client import polish as groq_polish
from ..groq_client import transcribe as groq_transcribe
from ..groq_client import validate_chat_model, validate_whisper_model
from ..models import (
    CleanupMode,
    PolishMode,
    TranscriptionListItem,
    TranscriptionListResponse,
    TranscriptionResponse,
)

log = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(verify_auth)])


_AUDIO_MEDIA_TYPES = {
    "m4a":  "audio/mp4",
    "mp3":  "audio/mpeg",
    "wav":  "audio/wav",
    "webm": "audio/webm",
    "ogg":  "audio/ogg",
    "flac": "audio/flac",
}


def _has(row, col: str) -> bool:
    """aiosqlite.Row doesn't expose .keys() reliably; this is the safest probe
    for newly-added columns that may be NULL on legacy rows."""
    try:
        row[col]
        return True
    except (IndexError, KeyError):
        return False


def _safe(row, col: str):
    return row[col] if _has(row, col) else None


def _row_to_full(row) -> TranscriptionResponse:
    polished = _safe(row, "text_polished")
    text = polished if polished else (row["text_clean"] or row["text_raw"])
    return TranscriptionResponse(
        id=row["id"],
        text=text,
        text_raw=row["text_raw"],
        text_clean=row["text_clean"],
        text_polished=polished,
        language=row["language"],
        duration_s=row["duration_s"],
        source=row["source"],
        whisper_model=row["whisper_model"],
        cleanup_model=row["cleanup_model"],
        cleanup_mode=row["cleanup_mode"],
        polish_model=_safe(row, "polish_model"),
        polish_mode=_safe(row, "polish_mode"),
        whisper_ms=row["whisper_ms"],
        cleanup_ms=row["cleanup_ms"],
        polish_ms=_safe(row, "polish_ms"),
        audio_path=row["audio_path"],
        audio_bytes=row["audio_bytes"],
        audio_format=row["audio_format"],
        created_at=row["created_at"],
    )


@router.get("/transcriptions", response_model=TranscriptionListResponse)
async def list_transcriptions(
    limit: int = Query(50, ge=1, le=500),
    cursor: int | None = Query(None, description="created_at < cursor"),
    q: str | None = Query(None, description="FTS5 search across text_clean and text_raw"),
    source: str | None = Query(None),
) -> TranscriptionListResponse:
    where: list[str] = []
    params: list = []
    if cursor:
        where.append("t.created_at < ?")
        params.append(cursor)
    if source:
        where.append("t.source = ?")
        params.append(source)

    fts_query = build_fts_query(q) if q else ""

    if fts_query:
        sql = f"""
            SELECT t.* FROM transcriptions t
            JOIN transcriptions_fts f ON f.rowid = t.rowid
            WHERE transcriptions_fts MATCH ?
              {' AND ' + ' AND '.join(where) if where else ''}
            ORDER BY t.created_at DESC
            LIMIT ?
        """
        bind = [fts_query, *params, limit + 1]
    else:
        sql = f"""
            SELECT t.* FROM transcriptions t
            {' WHERE ' + ' AND '.join(where) if where else ''}
            ORDER BY t.created_at DESC
            LIMIT ?
        """
        bind = [*params, limit + 1]

    async with get_db() as conn:
        async with conn.execute(sql, bind) as cur:
            rows = await cur.fetchall()

    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        TranscriptionListItem(
            id=r["id"],
            text=((_safe(r, "text_polished") or r["text_clean"] or r["text_raw"]) or "")[:300],
            language=r["language"],
            duration_s=r["duration_s"],
            source=r["source"],
            has_audio=bool(r["audio_path"]),
            created_at=r["created_at"],
        )
        for r in rows
    ]
    next_cursor = rows[-1]["created_at"] if has_more and rows else None
    return TranscriptionListResponse(items=items, next_cursor=next_cursor)


@router.get("/transcriptions/{tid}", response_model=TranscriptionResponse)
async def get_transcription(tid: str) -> TranscriptionResponse:
    async with get_db() as conn:
        async with conn.execute("SELECT * FROM transcriptions WHERE id = ?", (tid,)) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return _row_to_full(row)


@router.delete("/transcriptions/{tid}")
async def delete_transcription(tid: str) -> dict:
    async with get_db() as conn:
        async with conn.execute(
            "SELECT audio_path FROM transcriptions WHERE id = ?", (tid,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        if row["audio_path"]:
            p = Path(row["audio_path"])
            if p.exists():
                try:
                    p.unlink()
                except OSError as exc:
                    log.warning("Could not unlink %s: %s", p, exc)
        await conn.execute("DELETE FROM transcriptions WHERE id = ?", (tid,))
        await conn.commit()
    return {"deleted": tid}


@router.get("/transcriptions/{tid}/audio")
async def get_audio(tid: str):
    async with get_db() as conn:
        async with conn.execute(
            "SELECT audio_path, audio_format FROM transcriptions WHERE id = ?", (tid,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    if not row["audio_path"]:
        raise HTTPException(404, "Audio purged or never stored")
    p = Path(row["audio_path"])
    if not p.exists():
        raise HTTPException(404, "Audio file missing on disk")
    ext = row["audio_format"] or "bin"
    return FileResponse(
        p,
        media_type=_AUDIO_MEDIA_TYPES.get(ext, "application/octet-stream"),
        filename=p.name,
    )


@router.post("/transcriptions/{tid}/recleanup", response_model=TranscriptionResponse)
async def recleanup(
    tid: str,
    cleanup_mode: CleanupMode = Query("standard"),
    cleanup_model: str | None = Query(None),
) -> TranscriptionResponse:
    try:
        validate_chat_model(cleanup_model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    async with get_db() as conn:
        async with conn.execute("SELECT * FROM transcriptions WHERE id = ?", (tid,)) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")

    glossary = await load_glossary()
    try:
        cl = await groq_cleanup(
            raw_text=row["text_raw"],
            glossary=glossary,
            mode=cleanup_mode,
            language=row["language"],
            model=cleanup_model,
        )
    except ValueError as exc:
        log.info("Cleanup refused (input too long): %s", exc)
        raise HTTPException(413, str(exc)) from exc
    # Re-cleanup invalidates any prior polish (it was based on the previous
    # cleaned text, which has now changed).
    async with get_db() as conn:
        await conn.execute(
            """
            UPDATE transcriptions
            SET text_clean = ?, cleanup_model = ?, cleanup_mode = ?, cleanup_ms = ?,
                text_polished = NULL, polish_model = NULL, polish_mode = NULL, polish_ms = NULL
            WHERE id = ?
            """,
            (cl.text, cl.model, cl.mode, cl.elapsed_ms, tid),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM transcriptions WHERE id = ?", (tid,)) as cur:
            updated = await cur.fetchone()
    return _row_to_full(updated)


@router.post("/transcriptions/{tid}/retranscribe", response_model=TranscriptionResponse)
async def retranscribe(
    tid: str,
    model: str = Query(
        "",
        description=(
            "Whisper model. Empty → use WHISPER_ACCURATE_MODEL "
            "(whisper-large-v3 by default). Pass any Groq Whisper model id to override."
        ),
    ),
    language: str | None = Query(None),
) -> TranscriptionResponse:
    """Re-run the original audio through Whisper. Useful when the user thinks
    the default turbo model misheard a word — by default we re-run with the
    higher-accuracy non-turbo variant. Resets text_clean and text_polished
    since they were derived from the previous transcript."""
    try:
        validate_whisper_model(model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    async with get_db() as conn:
        async with conn.execute("SELECT * FROM transcriptions WHERE id = ?", (tid,)) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    if not row["audio_path"]:
        raise HTTPException(
            410, "Audio purged or never stored — cannot re-transcribe this clip."
        )
    p = Path(row["audio_path"])
    if not p.exists():
        raise HTTPException(410, "Audio file missing on disk — cannot re-transcribe.")

    audio_bytes = await asyncio.to_thread(p.read_bytes)
    ext = row["audio_format"] or "webm"
    content_type = _AUDIO_MEDIA_TYPES.get(ext, f"audio/{ext}")

    used_model = model or settings.whisper_accurate_model
    glossary = await load_glossary()
    try:
        whisper = await groq_transcribe(
            file_bytes=audio_bytes,
            filename=p.name,
            content_type=content_type,
            glossary=glossary,
            language=language or row["language"],
            model=used_model,
        )
    except Exception as exc:
        log.exception("Re-transcribe call failed")
        raise HTTPException(502, "Transcription upstream failed") from exc

    async with get_db() as conn:
        await conn.execute(
            """
            UPDATE transcriptions SET
                text_raw = ?,
                language = ?,
                whisper_model = ?,
                whisper_ms = ?,
                text_clean = NULL, cleanup_model = NULL, cleanup_mode = NULL, cleanup_ms = NULL,
                text_polished = NULL, polish_model = NULL, polish_mode = NULL, polish_ms = NULL
            WHERE id = ?
            """,
            (whisper.text, whisper.language, whisper.model, whisper.elapsed_ms, tid),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM transcriptions WHERE id = ?", (tid,)) as cur:
            updated = await cur.fetchone()
    return _row_to_full(updated)


@router.post("/transcriptions/{tid}/polish", response_model=TranscriptionResponse)
async def polish_transcription(
    tid: str,
    mode: PolishMode = Query("standard"),
    polish_model: str | None = Query(
        None,
        description=(
            "Override polish model. Empty → use POLISH_MODEL_DEFAULT for "
            "light/standard, POLISH_STRONG_MODEL for strong."
        ),
    ),
) -> TranscriptionResponse:
    """Apply polish-mode rewriting to the cleaned text (or raw text if no
    cleanup was run). Polish reorders/rephrases for readability — see
    POLISH_INSTRUCTIONS in groq_client.py for what each mode does."""
    try:
        validate_chat_model(polish_model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    async with get_db() as conn:
        async with conn.execute("SELECT * FROM transcriptions WHERE id = ?", (tid,)) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")

    source_text = row["text_clean"] or row["text_raw"]
    if not source_text:
        raise HTTPException(400, "No text to polish")

    glossary = await load_glossary()
    try:
        po = await groq_polish(
            text=source_text,
            glossary=glossary,
            mode=mode,
            language=row["language"],
            model=polish_model,
        )
    except ValueError as exc:
        # Our own pre-flight TPM check caught it — this is a request-too-large
        # condition, not an upstream failure. 413 + the helpful message.
        log.info("Polish refused (input too long): %s", exc)
        raise HTTPException(413, str(exc)) from exc
    except Exception as exc:
        log.exception("Polish call failed")
        raise HTTPException(502, "Polish upstream failed") from exc

    async with get_db() as conn:
        await conn.execute(
            """
            UPDATE transcriptions
            SET text_polished = ?, polish_model = ?, polish_mode = ?, polish_ms = ?
            WHERE id = ?
            """,
            (po.text, po.model, po.mode, po.elapsed_ms, tid),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM transcriptions WHERE id = ?", (tid,)) as cur:
            updated = await cur.fetchone()
    return _row_to_full(updated)


# Polish queue — for transcripts too long for a single TPM-window call.
# Splits the text into ≤2400-token chunks, creates a Note, and the
# background worker (polish_queue.worker_loop) processes one chunk per
# minute per model, appending each polished chunk to the note's body.
# Returns 202 Accepted with the new note id; the client polls the Notes
# endpoint to watch progress.
@router.post("/transcriptions/{tid}/polish-queue", status_code=202)
async def polish_transcription_queued(
    tid: str,
    mode: PolishMode = Query("strong"),
    polish_model: str | None = Query(None),
) -> dict:
    """Enqueue a long transcript for chunked polish processing in the
    background. Use this when the synchronous /polish endpoint returns 413."""
    from ..polish_queue import enqueue_polish

    try:
        validate_chat_model(polish_model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    async with get_db() as conn:
        async with conn.execute("SELECT * FROM transcriptions WHERE id = ?", (tid,)) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    source_text = row["text_clean"] or row["text_raw"]
    if not source_text:
        raise HTTPException(400, "No text to queue")

    # Title for the queued note — first 40 chars of the source so the
    # user can identify it in the Queued section.
    snippet = source_text[:40].strip()
    if len(source_text) > 40:
        snippet += "…"
    title = f"Polish: {snippet}"

    note_id, total = await enqueue_polish(
        text=source_text,
        title=title,
        mode=mode,
        polish_model=polish_model,
        language=row["language"] or "auto",
    )
    return {
        "queued": True,
        "note_id": note_id,
        "total_chunks": total,
        "message": (
            f"Queued {total} chunks. The note will fill in progressively over the "
            f"next ~{total} minutes — find it in the Notes tab under \"Queued\"."
        ),
    }


# Cron-like: simple manual trigger to purge old audio (for ops, not user UI)
@router.post("/maintenance/purge-audio")
async def purge() -> dict:
    from ..storage import purge_old_audio
    deleted = await purge_old_audio()
    return {"deleted": deleted, "ts": int(time.time())}
