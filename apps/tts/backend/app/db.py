import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite

from .config import settings

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


async def init_db() -> None:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    settings.audio_dir.mkdir(parents=True, exist_ok=True)
    schema = SCHEMA_PATH.read_text()
    async with aiosqlite.connect(settings.db_path) as conn:
        await conn.executescript(schema)
        await _migrate(conn)
        await conn.commit()


async def _migrate(conn: aiosqlite.Connection) -> None:
    """Idempotent column additions for legacy DBs.

    `CREATE TABLE IF NOT EXISTS` skips an existing table whose columns lag
    behind the new schema, so we patch in additions explicitly. Each ADD
    COLUMN is guarded by a `pragma_table_info` lookup so this is safe to
    re-run on every startup.
    """
    await _ensure_columns(
        conn,
        "transcriptions",
        [
            ("text_polished", "TEXT"),
            ("polish_model", "TEXT"),
            ("polish_mode", "TEXT"),
            ("polish_ms", "INTEGER"),
        ],
    )
    # Polish-queue support — added later than the original notes table,
    # so legacy DBs need ALTER TABLE for the new columns. The index on
    # queue_status has to live here too, *after* the column is in place
    # — running CREATE INDEX in schema.sql would crash on legacy DBs
    # whose `notes` table predates queue_status.
    await _ensure_columns(
        conn,
        "notes",
        [
            ("queue_status", "TEXT"),
            ("queue_kind", "TEXT"),
            ("queue_total_chunks", "INTEGER"),
            ("queue_completed_chunks", "INTEGER NOT NULL DEFAULT 0"),
        ],
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_queue_status ON notes (queue_status)"
    )
    await _backfill_notes_fts(conn)


async def _backfill_notes_fts(conn: aiosqlite.Connection) -> None:
    """Populate notes_fts from existing notes rows on first deploy.

    `CREATE VIRTUAL TABLE IF NOT EXISTS` creates an empty FTS index, and the
    triggers only fire on future writes — so a DB that already has notes
    when this migration first lands would have an unsearchable backlog.
    The rebuild is a no-op once the index is populated, so we gate it on
    `notes` having rows but the FTS index actually being empty.

    Note: `SELECT COUNT(*) FROM notes_fts` is **not** a valid emptiness
    probe — for an `external-content` FTS5 table it reports the row count
    of the source `notes` table regardless of whether the index has been
    built. The shadow table `notes_fts_docsize` (1 row per indexed
    document) is the correct probe.
    """
    async with conn.execute("SELECT COUNT(*) FROM notes") as cur:
        notes_count = (await cur.fetchone())[0]
    if notes_count == 0:
        return
    async with conn.execute("SELECT COUNT(*) FROM notes_fts_docsize") as cur:
        indexed = (await cur.fetchone())[0]
    if indexed >= notes_count:
        return
    await conn.execute("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')")


async def _ensure_columns(
    conn: aiosqlite.Connection, table: str, columns: list[tuple[str, str]]
) -> None:
    async with conn.execute(f"PRAGMA table_info({table})") as cur:
        existing = {row[1] for row in await cur.fetchall()}
    for name, col_type in columns:
        if name not in existing:
            await conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {col_type}")


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    async with aiosqlite.connect(settings.db_path) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON")
        yield conn


async def get_setting(key: str, default: str | None = None) -> str | None:
    async with get_db() as conn:
        async with conn.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cur:
            row = await cur.fetchone()
    return row["value"] if row else default


async def set_setting(key: str, value: str) -> None:
    async with get_db() as conn:
        await conn.execute(
            "INSERT INTO settings(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        await conn.commit()


async def delete_setting(key: str) -> None:
    async with get_db() as conn:
        await conn.execute("DELETE FROM settings WHERE key = ?", (key,))
        await conn.commit()


async def get_json_setting(key: str, default):
    raw = await get_setting(key)
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


async def set_json_setting(key: str, value) -> None:
    await set_setting(key, json.dumps(value, ensure_ascii=False))
