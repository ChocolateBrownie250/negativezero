import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { setEncryptionKey, encryptString, decryptString, decryptNullable } from './lib/crypto.js';

setEncryptionKey(config.encryptionKeyHex);

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'bookmarks.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT REFERENCES nodes(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('folder', 'bookmark')),
    name        TEXT NOT NULL,
    url         TEXT,
    favicon_url TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_nodes_parent          ON nodes(parent_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_parent_position ON nodes(parent_id, position);

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

const now = Date.now();
db.prepare(
  `INSERT OR IGNORE INTO nodes (id, parent_id, type, name, position, created_at, updated_at)
   VALUES ('root', NULL, 'folder', ?, 0, ?, ?)`,
).run(encryptString('Bookmarks'), now, now);

// One-shot repair for rows that were double-encrypted by the old PATCH
// handler (it called encryptString() on row.name/row.url even when the
// request body didn't supply a new value, wrapping the already-encrypted
// DB string a second time). Gated by auth_meta.repair_v1_done so the
// O(rows) scan only happens once per database.
//
// Detector: decrypt one layer, then attempt to decrypt the *result*
// again. Only a genuine double-wrap will succeed at the second decrypt
// (AES-GCM's auth tag rejects everything that wasn't encrypted with our
// key). User-typed values that happen to start with `enc1:` will fail
// the inner decrypt and are left alone.
{
  const repairDone =
    (db.prepare('SELECT v FROM auth_meta WHERE k = ?').get('repair_v1_done') as
      | { v: string }
      | undefined)?.v === '1';
  if (!repairDone) {
    const rows = db
      .prepare('SELECT id, name, url FROM nodes')
      .all() as { id: string; name: string; url: string | null }[];
    const updName = db.prepare('UPDATE nodes SET name = ? WHERE id = ?');
    const updUrl = db.prepare('UPDATE nodes SET url = ? WHERE id = ?');
    let fixedNames = 0;
    let fixedUrls = 0;

    function isTrueDoubleWrap(inner: string): boolean {
      if (!inner.startsWith('enc1:')) return false;
      try {
        decryptString(inner);
        return true;
      } catch {
        return false;
      }
    }

    const tx = db.transaction(() => {
      for (const r of rows) {
        const decName = decryptNullable(r.name);
        if (decName && isTrueDoubleWrap(decName)) {
          updName.run(decName, r.id);
          fixedNames++;
        }
        if (r.url) {
          const decUrl = decryptNullable(r.url);
          if (decUrl && isTrueDoubleWrap(decUrl)) {
            updUrl.run(decUrl, r.id);
            fixedUrls++;
          }
        }
      }
      db.prepare(
        `INSERT INTO auth_meta (k, v, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`,
      ).run('repair_v1_done', '1', Date.now());
    });
    tx();

    if (fixedNames || fixedUrls) {
      // eslint-disable-next-line no-console
      console.log(
        `[repair] unwrapped double-encrypted rows: names=${fixedNames}, urls=${fixedUrls}`,
      );
    }
  }
}

export type DbNodeRow = {
  id: string;
  parent_id: string | null;
  type: 'folder' | 'bookmark';
  name: string;
  url: string | null;
  favicon_url: string | null;
  position: number;
  created_at: number;
  updated_at: number;
};

export type ApiNode =
  | {
      id: string;
      parentId: string | null;
      type: 'folder';
      name: string;
      position: number;
      createdAt: number;
      updatedAt: number;
    }
  | {
      id: string;
      parentId: string;
      type: 'bookmark';
      name: string;
      url: string;
      faviconUrl: string | null;
      position: number;
      createdAt: number;
      updatedAt: number;
    };

export function rowToApi(row: DbNodeRow): ApiNode {
  const name = decryptNullable(row.name) ?? '';
  if (row.type === 'folder') {
    return {
      id: row.id,
      parentId: row.parent_id,
      type: 'folder',
      name,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  return {
    id: row.id,
    parentId: row.parent_id ?? '',
    type: 'bookmark',
    name,
    url: decryptNullable(row.url) ?? '',
    faviconUrl: decryptNullable(row.favicon_url),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
