PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcriptions (
    id              TEXT PRIMARY KEY,
    source          TEXT,
    language        TEXT,
    duration_s      REAL,
    whisper_model   TEXT NOT NULL,
    cleanup_model   TEXT,
    cleanup_mode    TEXT,
    text_raw        TEXT NOT NULL,
    text_clean      TEXT,
    -- Polish columns. New rows get them; legacy DBs are patched in db.py.
    text_polished   TEXT,
    polish_model    TEXT,
    polish_mode     TEXT,
    polish_ms       INTEGER,
    audio_path      TEXT,
    audio_bytes     INTEGER,
    audio_format    TEXT,
    whisper_ms      INTEGER,
    cleanup_ms      INTEGER,
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transcriptions_created
    ON transcriptions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcriptions_source
    ON transcriptions (source, created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS transcriptions_fts USING fts5(
    text_clean, text_raw,
    content='transcriptions', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_transcriptions_ai AFTER INSERT ON transcriptions BEGIN
    INSERT INTO transcriptions_fts(rowid, text_clean, text_raw)
    VALUES (new.rowid, COALESCE(new.text_clean, ''), new.text_raw);
END;

CREATE TRIGGER IF NOT EXISTS trg_transcriptions_ad AFTER DELETE ON transcriptions BEGIN
    INSERT INTO transcriptions_fts(transcriptions_fts, rowid, text_clean, text_raw)
    VALUES ('delete', old.rowid, COALESCE(old.text_clean, ''), old.text_raw);
END;

CREATE TRIGGER IF NOT EXISTS trg_transcriptions_au AFTER UPDATE ON transcriptions BEGIN
    INSERT INTO transcriptions_fts(transcriptions_fts, rowid, text_clean, text_raw)
    VALUES ('delete', old.rowid, COALESCE(old.text_clean, ''), old.text_raw);
    INSERT INTO transcriptions_fts(rowid, text_clean, text_raw)
    VALUES (new.rowid, COALESCE(new.text_clean, ''), new.text_raw);
END;

-- Notes — typed + dictated documents owned by the API key holder.
-- Each note has its own pipeline settings: cleanup mode and polish mode are
-- applied to dictated audio before the result is returned to the client.
--
-- queue_status / queue_kind / queue_total_chunks / queue_completed_chunks
-- support background-processed notes (e.g., polish-queue): when a long
-- transcription can't be polished in one TPM-window, the polished text is
-- assembled chunk-by-chunk into a note with queue_status='processing'.
-- Once all chunks land, queue_status flips to 'done' and the note shows
-- in the regular Notes list. While processing, the note appears in a
-- separate "Queued" section in the UI.
CREATE TABLE IF NOT EXISTS notes (
    id                       TEXT PRIMARY KEY,
    title                    TEXT NOT NULL DEFAULT '',
    body                     TEXT NOT NULL DEFAULT '',
    cleanup_mode             TEXT NOT NULL DEFAULT 'off',
    polish_mode              TEXT NOT NULL DEFAULT 'off',
    language                 TEXT NOT NULL DEFAULT 'auto',
    queue_status             TEXT,            -- null | processing | done | failed
    queue_kind               TEXT,            -- e.g. 'polish' (for now)
    queue_total_chunks       INTEGER,
    queue_completed_chunks   INTEGER NOT NULL DEFAULT 0,
    created_at               INTEGER NOT NULL,
    updated_at               INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_updated      ON notes (updated_at DESC);
-- The idx_notes_queue_status index lives in db.py:_migrate so it runs
-- AFTER the ALTER TABLE that adds queue_status — running it here
-- would crash on legacy DBs whose `notes` table predates queue_status.

-- Queue of chunks waiting to be processed by a background worker.
-- One row per chunk; the worker picks one pending row at a time
-- (subject to per-model rate-limiting) and writes the polished text
-- into polished_text + bumps the parent note's body and counter.
CREATE TABLE IF NOT EXISTS note_queue (
    id              TEXT PRIMARY KEY,
    note_id         TEXT NOT NULL,
    chunk_index     INTEGER NOT NULL,
    chunk_text      TEXT NOT NULL,
    polish_mode     TEXT NOT NULL,
    polish_model    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
    error           TEXT,
    polished_text   TEXT,
    started_at      INTEGER,
    completed_at    INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_note_queue_status ON note_queue (status, created_at);
CREATE INDEX IF NOT EXISTS idx_note_queue_note   ON note_queue (note_id, chunk_index);

-- Full-text search across notes.title and notes.body. Same tokenizer as
-- transcriptions_fts so behaviour is consistent: unicode61 lowercases and
-- folds diacritics, so "Café" matches "cafe" and "Путин" matches "путин".
-- content='notes' keeps the FTS table as a contentless mirror so we don't
-- duplicate the body text on disk; triggers below keep the index in sync.
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title, body,
    content='notes', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, body)
    VALUES (new.rowid, COALESCE(new.title, ''), COALESCE(new.body, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body)
    VALUES ('delete', old.rowid, COALESCE(old.title, ''), COALESCE(old.body, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body)
    VALUES ('delete', old.rowid, COALESCE(old.title, ''), COALESCE(old.body, ''));
    INSERT INTO notes_fts(rowid, title, body)
    VALUES (new.rowid, COALESCE(new.title, ''), COALESCE(new.body, ''));
END;
