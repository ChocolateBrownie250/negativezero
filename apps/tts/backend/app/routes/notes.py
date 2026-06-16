"""
Notes — typed + dictated documents owned by the API key holder.

Each note has its own pipeline settings: cleanup mode and polish mode are
applied to dictated audio before the result is returned to the client.

Architectural choice: the /dictate endpoint does NOT mutate the note body.
It receives audio, runs the pipeline, returns processed text. The client is
responsible for inserting that text at the saved cursor offset and PATCHing
the body back. Rationale: the user might keep typing during the 1-3 s
network round-trip, and the local body is the source of truth for the
editor; doing insertion server-side would force a body-locking dance and
risk losing user input.
"""
import logging
import time
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from ulid import ULID

from ..auth import verify_auth
from ..db import get_db
from ..fts import build_fts_query
from ..glossary import load_glossary
from ..groq_client import cleanup as groq_cleanup
from ..groq_client import map_upstream_error
from ..groq_client import polish as groq_polish
from ..groq_client import transcribe as groq_transcribe
from ..models import (
    NoteCreate,
    NoteDictateResponse,
    NoteListItem,
    NoteListResponse,
    NoteResponse,
    NoteUpdate,
)

log = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(verify_auth)])


def _safe(row, col: str):
    """Tolerate legacy rows that don't have the queue columns yet."""
    try:
        return row[col]
    except (IndexError, KeyError):
        return None


def _row_to_note(row) -> NoteResponse:
    return NoteResponse(
        id=row["id"],
        title=row["title"] or "",
        body=row["body"] or "",
        cleanup_mode=row["cleanup_mode"] or "off",
        polish_mode=row["polish_mode"] or "off",
        language=row["language"] or "auto",
        queue_status=_safe(row, "queue_status"),
        queue_kind=_safe(row, "queue_kind"),
        queue_total_chunks=_safe(row, "queue_total_chunks"),
        queue_completed_chunks=_safe(row, "queue_completed_chunks") or 0,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/notes", response_model=NoteListResponse)
async def list_notes(
    limit: int = Query(50, ge=1, le=500),
    cursor: int | None = Query(None, description="updated_at < cursor"),
    q: str | None = Query(None, description="FTS5 search across title and body (case- and diacritics-insensitive)"),
    queue: str | None = Query(
        None,
        description="Filter by queue status. 'processing' = active polish queue, "
                    "'idle' = no queue or queue done. Omit for all notes.",
    ),
) -> NoteListResponse:
    where: list[str] = []
    params: list = []
    if cursor:
        where.append("n.updated_at < ?")
        params.append(cursor)
    if queue == "processing":
        where.append("n.queue_status = 'processing'")
    elif queue == "idle":
        where.append("(n.queue_status IS NULL OR n.queue_status = 'done')")

    fts_query = build_fts_query(q) if q else ""

    select_cols = (
        "n.id, n.title, n.body, n.updated_at, n.created_at, "
        "n.queue_status, n.queue_total_chunks, n.queue_completed_chunks"
    )
    if fts_query:
        sql = f"""
            SELECT {select_cols} FROM notes n
            JOIN notes_fts f ON f.rowid = n.rowid
            WHERE notes_fts MATCH ?
              {' AND ' + ' AND '.join(where) if where else ''}
            ORDER BY n.updated_at DESC
            LIMIT ?
        """
        bind = [fts_query, *params, limit + 1]
    else:
        sql = f"""
            SELECT {select_cols} FROM notes n
            {' WHERE ' + ' AND '.join(where) if where else ''}
            ORDER BY n.updated_at DESC
            LIMIT ?
        """
        bind = [*params, limit + 1]

    async with get_db() as conn:
        async with conn.execute(sql, bind) as cur:
            rows = await cur.fetchall()

    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        NoteListItem(
            id=r["id"],
            title=r["title"] or "",
            snippet=(r["body"] or "")[:200],
            queue_status=_safe(r, "queue_status"),
            queue_total_chunks=_safe(r, "queue_total_chunks"),
            queue_completed_chunks=_safe(r, "queue_completed_chunks") or 0,
            updated_at=r["updated_at"],
            created_at=r["created_at"],
        )
        for r in rows
    ]
    next_cursor = rows[-1]["updated_at"] if has_more and rows else None
    return NoteListResponse(items=items, next_cursor=next_cursor)


@router.post("/notes", response_model=NoteResponse)
async def create_note(payload: NoteCreate) -> NoteResponse:
    nid = str(ULID())
    now = int(time.time())
    async with get_db() as conn:
        await conn.execute(
            """
            INSERT INTO notes (id, title, body, cleanup_mode, polish_mode, language, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?)
            """,
            (
                nid,
                payload.title or "",
                payload.body or "",
                payload.cleanup_mode or "off",
                payload.polish_mode or "off",
                payload.language or "auto",
                now,
                now,
            ),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM notes WHERE id = ?", (nid,)) as cur:
            row = await cur.fetchone()
    return _row_to_note(row)


@router.get("/notes/{nid}", response_model=NoteResponse)
async def get_note(nid: str) -> NoteResponse:
    async with get_db() as conn:
        async with conn.execute("SELECT * FROM notes WHERE id = ?", (nid,)) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return _row_to_note(row)


@router.patch("/notes/{nid}", response_model=NoteResponse)
async def update_note(nid: str, payload: NoteUpdate) -> NoteResponse:
    fields: list[str] = []
    params: list = []
    for f in ("title", "body", "cleanup_mode", "polish_mode", "language"):
        v = getattr(payload, f)
        if v is not None:
            fields.append(f"{f} = ?")
            params.append(v)
    if not fields:
        # No-op PATCH: still return the current state so the client can
        # re-sync its view without a separate GET.
        async with get_db() as conn:
            async with conn.execute("SELECT * FROM notes WHERE id = ?", (nid,)) as cur:
                row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        return _row_to_note(row)

    fields.append("updated_at = ?")
    params.append(int(time.time()))
    params.append(nid)

    async with get_db() as conn:
        async with conn.execute(
            f"UPDATE notes SET {', '.join(fields)} WHERE id = ?", params
        ) as cur:
            if cur.rowcount == 0:
                raise HTTPException(404, "Not found")
        await conn.commit()
        async with conn.execute("SELECT * FROM notes WHERE id = ?", (nid,)) as cur:
            row = await cur.fetchone()
    return _row_to_note(row)


@router.delete("/notes/{nid}")
async def delete_note(nid: str) -> dict:
    async with get_db() as conn:
        async with conn.execute("DELETE FROM notes WHERE id = ?", (nid,)) as cur:
            if cur.rowcount == 0:
                raise HTTPException(404, "Not found")
        await conn.commit()
    return {"deleted": nid}


@router.post("/notes/{nid}/dictate", response_model=NoteDictateResponse)
async def dictate_into_note(
    nid: str,
    file: Annotated[UploadFile, File(...)],
) -> NoteDictateResponse:
    """Transcribe audio and run it through the note's configured cleanup +
    polish pipeline. Returns the processed text — the client inserts it at
    the saved cursor position and PATCHes the body."""
    async with get_db() as conn:
        async with conn.execute("SELECT * FROM notes WHERE id = ?", (nid,)) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")

    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty audio")

    glossary = await load_glossary()
    language = None if (row["language"] or "auto") == "auto" else row["language"]

    try:
        whisper = await groq_transcribe(
            file_bytes=data,
            filename=file.filename or "note.webm",
            content_type=file.content_type or "audio/webm",
            glossary=glossary,
            language=language,
        )
    except Exception as exc:
        log.exception("Note-dictate transcribe failed")
        status, detail = map_upstream_error(exc, action="Transcription")
        raise HTTPException(status, detail) from exc

    text_raw = whisper.text
    text_cleaned: str | None = None
    cleanup_ms: int | None = None
    cleanup_mode = (row["cleanup_mode"] or "off").lower()
    if cleanup_mode != "off" and text_raw:
        try:
            cl = await groq_cleanup(
                raw_text=text_raw,
                glossary=glossary,
                mode=cleanup_mode,
                language=whisper.language or language,
            )
            text_cleaned = cl.text
            cleanup_ms = cl.elapsed_ms
        except Exception:
            log.exception("Note-dictate cleanup failed; continuing with raw")

    text_polished: str | None = None
    polish_ms: int | None = None
    polish_mode = (row["polish_mode"] or "off").lower()
    if polish_mode != "off":
        source = text_cleaned or text_raw
        if source:
            try:
                po = await groq_polish(
                    text=source,
                    glossary=glossary,
                    mode=polish_mode,
                    language=whisper.language or language,
                )
                text_polished = po.text
                polish_ms = po.elapsed_ms
            except Exception:
                log.exception("Note-dictate polish failed; continuing without polish")

    final_text = text_polished or text_cleaned or text_raw
    return NoteDictateResponse(
        text=final_text,
        text_raw=text_raw,
        text_clean=text_cleaned,
        text_polished=text_polished,
        language=whisper.language,
        whisper_ms=whisper.elapsed_ms,
        cleanup_ms=cleanup_ms,
        polish_ms=polish_ms,
    )
