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

  -- Multi-account model. One row per user; 'owner' is the seeded super-account.
  CREATE TABLE IF NOT EXISTS accounts (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'disabled'
    is_owner   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  -- Per-account, per-service access grant. Absence of a row == no access.
  CREATE TABLE IF NOT EXISTS account_services (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    service    TEXT NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (account_id, service)
  );
`);

// ── Lightweight migrations for columns added after the initial schema ────────
function hasColumn(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function addColumn(table: string, column: string, decl: string): void {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

// Passkeys belong to an account. Pre-existing rows are the single owner.
addColumn('credentials', 'account_id', "TEXT NOT NULL DEFAULT 'owner'");
// Setup codes carry which services they grant and who redeemed them.
addColumn('generated_codes', 'granted_services', 'TEXT'); // JSON array of service ids
addColumn('generated_codes', 'name', 'TEXT'); // name for the account the code will create
addColumn('generated_codes', 'used_at', 'INTEGER');
addColumn('generated_codes', 'account_id', 'TEXT'); // set when redeemed

export type CredentialRow = {
  id: string;
  public_key: Buffer;
  counter: number;
  transports: string | null;
  device_name: string | null;
  created_at: number;
  last_used: number | null;
  account_id: string;
};

export type GeneratedCodeRow = {
  id: string;
  service: string;
  code_hash: string;
  label: string | null;
  created_at: number;
  granted_services: string | null;
  name: string | null;
  used_at: number | null;
  account_id: string | null;
};

export type AuditLogRow = {
  id: number;
  ts: number;
  event: string;
  detail: string | null;
  ip: string | null;
};

export type AccountRow = {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  is_owner: number;
  created_at: number;
};

export type AccountServiceRow = {
  account_id: string;
  service: string;
  enabled: number;
};
