"""Usage statistics endpoint.

Aggregates over the local transcriptions table — what the user actually ran
through this server. We don't currently scrape Groq's rate-limit headers
(possible follow-up); for now this gives an honest "how much have I spent"
view based on stored audio duration, request counts, and processing time.
"""
from __future__ import annotations

import datetime as dt
import time

from fastapi import APIRouter, Depends

from ..auth import verify_auth
from ..db import get_db

router = APIRouter(dependencies=[Depends(verify_auth)])


def _bucket_starts(now_ts: int | None = None) -> dict[str, int]:
    """UNIX timestamps for the start of: today, this week (Mon), this month (UTC)."""
    now = dt.datetime.fromtimestamp(now_ts, tz=dt.UTC) if now_ts else dt.datetime.now(dt.UTC)
    today = dt.datetime(now.year, now.month, now.day, tzinfo=dt.UTC)
    monday = today - dt.timedelta(days=now.weekday())
    month = dt.datetime(now.year, now.month, 1, tzinfo=dt.UTC)
    return {
        "day":   int(today.timestamp()),
        "week":  int(monday.timestamp()),
        "month": int(month.timestamp()),
        "all":   0,
    }


@router.get("/usage")
async def usage_stats() -> dict:
    starts = _bucket_starts()
    out: dict[str, dict] = {}
    async with get_db() as conn:
        for key, since in starts.items():
            async with conn.execute(
                """
                SELECT COUNT(*)                          AS n,
                       COALESCE(SUM(duration_s),  0)     AS audio_s,
                       COALESCE(SUM(whisper_ms),  0)     AS whisper_ms,
                       COALESCE(SUM(cleanup_ms),  0)     AS cleanup_ms,
                       COALESCE(SUM(audio_bytes), 0)     AS audio_bytes,
                       SUM(CASE WHEN cleanup_mode IS NOT NULL THEN 1 ELSE 0 END) AS cleanups
                FROM transcriptions
                WHERE created_at >= ?
                """,
                (since,),
            ) as cur:
                row = await cur.fetchone()
            out[key] = {
                "transcriptions": int(row["n"]),
                "audio_seconds":  float(row["audio_s"] or 0),
                "whisper_ms":     int(row["whisper_ms"] or 0),
                "cleanup_ms":     int(row["cleanup_ms"] or 0),
                "audio_bytes":    int(row["audio_bytes"] or 0),
                "cleanups":       int(row["cleanups"] or 0),
            }
    return {"buckets": out, "now": int(time.time())}
