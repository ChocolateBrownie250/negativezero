import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'redirector.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS redirects (
    id           TEXT PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    target       TEXT NOT NULL,
    title        TEXT,
    hits         INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    last_used_at INTEGER
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_redirects_slug ON redirects(slug);

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

export type RedirectRow = {
  id: string;
  slug: string;
  target: string;
  title: string | null;
  hits: number;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
};

export type ApiRedirect = {
  id: string;
  slug: string;
  target: string;
  title: string | null;
  hits: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
};

export function rowToApi(row: RedirectRow): ApiRedirect {
  return {
    id: row.id,
    slug: row.slug,
    target: row.target,
    title: row.title,
    hits: row.hits,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}
