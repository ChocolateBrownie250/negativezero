"""
Polish queue — background processor for transcripts that don't fit in a
single LLM round-trip under Groq's TPM ceiling.

When the user hits "Polish (queue)" on a long transcript, the API:
  1. Splits the cleaned/raw text into chunks (chunker.chunk_text) sized
     to fit `max_chunk_tokens` for the chosen polish model.
  2. Creates a Note with queue_status='processing', queue_kind='polish',
     queue_total_chunks=N, queue_completed_chunks=0. Title is auto-
     derived from the first 40 chars of the source transcript so the
     note shows up clearly in the "Queued" section of the UI.
  3. Inserts one row per chunk into note_queue with status='pending'.

The background worker (start_worker()) ticks every 30 s and:
  • Walks pending chunks ordered by (created_at, chunk_index).
  • Skips any chunk whose model is still on the per-model cooldown.
  • Calls polish() for the picked chunk.
  • On success: appends polished_text to the parent note's body
    (newline-separated), increments queue_completed_chunks, marks the
    chunk done. If completed = total, flips note's queue_status='done'.
  • On ValueError (input still too long, e.g., chunker mis-sized):
    marks chunk failed with the error message, the note can re-queue
    or the user can split further.
  • On any other error: marks chunk failed and stops.

Per-model cooldown is in-memory (dict keyed by model name). Server
restart resets it — worst case we fire one extra call right after
boot, which the model will 429 and we'll retry the next tick.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import aiosqlite
from ulid import ULID

from .chunker import chunk_text, estimate_tokens
from .config import settings
from .db import get_db
from .glossary import load_glossary
from .groq_client import polish as groq_polish

log = logging.getLogger(__name__)

# Per-model cooldown — soft rate limit on the worker. Conservative so we
# never trip Groq's TPM. gpt-oss-120b is the tightest at 8000 TPM, and
# our chunks are sized so a single call is ~5500 tokens, leaving plenty
# of room for one call per minute.
_MODEL_COOLDOWN_S: dict[str, float] = {
    "openai/gpt-oss-120b": 65.0,
    "openai/gpt-oss-20b": 30.0,
    "meta-llama/llama-4-scout-17b-16e-instruct": 30.0,
    "llama-3.3-70b-versatile": 45.0,
    "qwen/qwen3-32b": 60.0,
}
_DEFAULT_COOLDOWN_S = 60.0

_last_call_at: dict[str, float] = {}
_worker_task: asyncio.Task[Any] | None = None
_TICK_SECONDS = 30.0
# Per-chunk token budget. Keeps a single polish call's input + system
# prompt well under the polish-strong model's 8 000 TPM ceiling.
CHUNK_TOKEN_BUDGET = 2_400


def _model_for_mode(mode: str, override: str | None = None) -> str:
    """Resolve which polish model handles `mode`. Mirrors groq_client.polish."""
    if override:
        return override
    if mode == "strong":
        return settings.polish_strong_model
    return settings.polish_model_default


async def enqueue_polish(
    *,
    text: str,
    title: str,
    mode: str,
    polish_model: str | None = None,
    cleanup_mode: str = "off",
    language: str = "auto",
) -> tuple[str, int]:
    """Create a queued note + queue rows for a long transcript.

    Returns (note_id, total_chunks). The caller is the API layer; the
    worker takes it from there.
    """
    chunks = chunk_text(text, CHUNK_TOKEN_BUDGET)
    if not chunks:
        raise ValueError("Empty transcript — nothing to queue.")

    nid = str(ULID())
    now = int(time.time())
    used_model = _model_for_mode(mode, polish_model)

    async with get_db() as conn:
        await conn.execute(
            """
            INSERT INTO notes (
                id, title, body, cleanup_mode, polish_mode, language,
                queue_status, queue_kind, queue_total_chunks, queue_completed_chunks,
                created_at, updated_at
            ) VALUES (?, ?, '', ?, ?, ?, 'processing', 'polish', ?, 0, ?, ?)
            """,
            (nid, title, cleanup_mode, mode, language, len(chunks), now, now),
        )
        for i, chunk in enumerate(chunks):
            qid = str(ULID())
            await conn.execute(
                """
                INSERT INTO note_queue (
                    id, note_id, chunk_index, chunk_text,
                    polish_mode, polish_model,
                    status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (qid, nid, i, chunk, mode, used_model, now, now),
            )
        await conn.commit()
    log.info("Polish queue created: note=%s chunks=%d model=%s", nid, len(chunks), used_model)
    return nid, len(chunks)


# ---- Worker --------------------------------------------------------------

def _model_off_cooldown(model: str) -> bool:
    last = _last_call_at.get(model, 0.0)
    cooldown = _MODEL_COOLDOWN_S.get(model, _DEFAULT_COOLDOWN_S)
    return (time.monotonic() - last) >= cooldown


async def _next_processable_chunk(conn: aiosqlite.Connection) -> dict | None:
    """Find the oldest pending chunk whose model is off-cooldown."""
    async with conn.execute(
        """
        SELECT id, note_id, chunk_index, chunk_text, polish_mode, polish_model
          FROM note_queue
         WHERE status = 'pending'
         ORDER BY created_at ASC, chunk_index ASC
        """
    ) as cur:
        rows = await cur.fetchall()
    for r in rows:
        if _model_off_cooldown(r["polish_model"] or ""):
            return dict(r)
    return None


async def _process_one_chunk(chunk_row: dict) -> None:
    """Run polish on a single chunk; update queue + note progress."""
    qid = chunk_row["id"]
    nid = chunk_row["note_id"]
    text = chunk_row["chunk_text"]
    mode = chunk_row["polish_mode"]
    model = chunk_row["polish_model"]
    now = int(time.time())

    async with get_db() as conn:
        await conn.execute(
            "UPDATE note_queue SET status='processing', started_at=?, updated_at=? WHERE id=?",
            (now, now, qid),
        )
        await conn.commit()

    glossary = await load_glossary()
    _last_call_at[model] = time.monotonic()
    try:
        result = await groq_polish(
            text=text, glossary=glossary, mode=mode, model=model
        )
    except ValueError as exc:
        # Chunk is itself too big for the model — shouldn't happen if the
        # chunker sized correctly, but fail cleanly and let the user act.
        log.warning("Polish queue chunk %s rejected as too long: %s", qid, exc)
        async with get_db() as conn:
            await conn.execute(
                "UPDATE note_queue SET status='failed', error=?, updated_at=? WHERE id=?",
                (str(exc), int(time.time()), qid),
            )
            await conn.commit()
        return
    except Exception as exc:
        log.exception("Polish queue chunk %s upstream failed", qid)
        async with get_db() as conn:
            await conn.execute(
                "UPDATE note_queue SET status='failed', error=?, updated_at=? WHERE id=?",
                (f"upstream: {exc}", int(time.time()), qid),
            )
            await conn.commit()
        return

    polished = result.text
    finished_at = int(time.time())
    async with get_db() as conn:
        await conn.execute(
            """
            UPDATE note_queue
               SET status='done', polished_text=?, completed_at=?, updated_at=?
             WHERE id=?
            """,
            (polished, finished_at, finished_at, qid),
        )
        # Append to the note's body — newline-separated so paragraphs
        # remain visible. Read-modify-write is fine: only the worker
        # writes the body, and only one chunk per minute lands.
        async with conn.execute("SELECT body, queue_total_chunks, queue_completed_chunks FROM notes WHERE id=?", (nid,)) as cur:
            row = await cur.fetchone()
        if row is None:
            log.warning("Polish queue: parent note %s vanished", nid)
            await conn.commit()
            return
        new_body = (row["body"] + "\n\n" + polished).strip() if row["body"] else polished
        completed = (row["queue_completed_chunks"] or 0) + 1
        total = row["queue_total_chunks"] or 0
        new_status = "done" if completed >= total else "processing"
        await conn.execute(
            """
            UPDATE notes
               SET body=?, queue_completed_chunks=?, queue_status=?, updated_at=?
             WHERE id=?
            """,
            (new_body, completed, new_status, finished_at, nid),
        )
        await conn.commit()
    log.info("Polish queue chunk done: note=%s chunk=%d (%d/%d)",
             nid, chunk_row["chunk_index"], completed, total)


async def _tick() -> None:
    async with get_db() as conn:
        chunk = await _next_processable_chunk(conn)
    if chunk is None:
        return
    await _process_one_chunk(chunk)


async def worker_loop() -> None:
    log.info("Polish-queue worker starting (tick=%.0fs)", _TICK_SECONDS)
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Polish-queue tick failed; continuing")
        await asyncio.sleep(_TICK_SECONDS)


def start_worker() -> asyncio.Task[Any]:
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(worker_loop())
    return _worker_task


def stop_worker() -> None:
    global _worker_task
    if _worker_task is not None:
        _worker_task.cancel()
        _worker_task = None
