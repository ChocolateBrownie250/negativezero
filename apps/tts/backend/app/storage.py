import asyncio
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from .config import settings
from .db import get_db

log = logging.getLogger(__name__)

GROQ_AUDIO_LIMIT_BYTES = 25 * 1024 * 1024  # Groq Whisper hard limit


def audio_path_for(transcription_id: str, ext: str) -> Path:
    now = datetime.now(timezone.utc)
    sub = settings.audio_dir / f"{now.year:04d}" / f"{now.month:02d}"
    sub.mkdir(parents=True, exist_ok=True)
    safe_ext = ext.lstrip(".") or "bin"
    return sub / f"{transcription_id}.{safe_ext}"


async def save_audio(transcription_id: str, ext: str, data: bytes) -> Path:
    path = audio_path_for(transcription_id, ext)
    await asyncio.to_thread(path.write_bytes, data)
    return path


async def purge_old_audio() -> int:
    """Delete audio files older than retention window. Text rows stay."""
    retention = settings.audio_retention_days
    if retention <= 0:
        return 0
    cutoff = int(time.time()) - retention * 86400
    deleted = 0
    async with get_db() as conn:
        async with conn.execute(
            "SELECT id, audio_path FROM transcriptions "
            "WHERE audio_path IS NOT NULL AND created_at < ?",
            (cutoff,),
        ) as cur:
            rows = await cur.fetchall()
        for row in rows:
            p = Path(row["audio_path"])
            if p.exists():
                try:
                    p.unlink()
                    deleted += 1
                except OSError as exc:
                    log.warning("Failed to unlink %s: %s", p, exc)
            await conn.execute(
                "UPDATE transcriptions SET audio_path = NULL WHERE id = ?",
                (row["id"],),
            )
        await conn.commit()
    if deleted:
        log.info("Purged %d audio files older than %d days", deleted, retention)
    return deleted


async def audio_purge_loop() -> None:
    """Background task: run purge once a day."""
    while True:
        try:
            await purge_old_audio()
        except Exception:
            log.exception("Audio purge failed")
        await asyncio.sleep(86400)
