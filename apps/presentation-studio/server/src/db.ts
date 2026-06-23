import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'citrine.db');
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
