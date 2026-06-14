import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'admin.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    id          TEXT PRIMARY KEY,
    public_key  BLOB NOT NULL,
    counter     INTEGER NOT NULL DEFAULT 0,
    transports  TEXT,
    device_name TEXT,
    created_at  INTEGER NOT NULL,
    last_used   INTEGER
  );

  CREATE TABLE IF NOT EXISTS auth_meta (
    k          TEXT PRIMARY KEY,
    v          TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS generated_codes (
    id           TEXT PRIMARY KEY,
    service      TEXT NOT NULL,
    code_hash    TEXT NOT NULL,
    label        TEXT,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_generated_codes_created ON generated_codes(created_at DESC);

  CREATE TABLE IF NOT EXISTS audit_log (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ts     INTEGER NOT NULL,
    event  TEXT NOT NULL,
    detail TEXT,
    ip     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts DESC);
`);

export type CredentialRow = {
  id: string;
  public_key: Buffer;
  counter: number;
  transports: string | null;
  device_name: string | null;
  created_at: number;
  last_used: number | null;
};

export type GeneratedCodeRow = {
  id: string;
  service: string;
  code_hash: string;
  label: string | null;
  created_at: number;
};

export type AuditLogRow = {
  id: number;
  ts: number;
  event: string;
  detail: string | null;
  ip: string | null;
};
