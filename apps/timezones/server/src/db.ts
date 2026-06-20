import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'timezones.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS presets (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    selection   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_presets_account
    ON presets(account_id, created_at DESC);
`);

export type PresetRow = {
  id: string;
  account_id: string;
  name: string;
  selection: string;
  created_at: number;
  updated_at: number;
};

// The saved snapshot of the planner's state — everything except the ephemeral
// `date` (a loaded preset applies to whatever day the user is viewing).
export type PresetSelection = {
  zones: string[];
  home: string;
  work: [number, number];
  fmt24: boolean;
};

export type ApiPreset = {
  id: string;
  name: string;
  selection: PresetSelection;
  createdAt: number;
  updatedAt: number;
};

export function rowToApi(row: PresetRow): ApiPreset {
  return {
    id: row.id,
    name: row.name,
    selection: JSON.parse(row.selection) as PresetSelection,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
