import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterAll } from 'vitest';
import { setEncryptionKey } from '../lib/crypto.js';

// Each test process gets its own DATA_DIR so SQLite files don't collide.
// Created before any test file imports db.ts (config.ts validates DATA_DIR
// via process.env at module load).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'url-vault-test-'));

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.ENCRYPTION_KEY = 'b'.repeat(64);
// Real bcrypt $2b$ envelope; routes never validate this hash (auth is bypassed
// in tests by skipping the requireAuth wrapper), but config.ts checks presence.
process.env.SETUP_CODE_HASH =
  '$2b$12$KIXxPfnK5DYZIyf68aVVoOJ.aWdMRPYJM6Sl8u7lYZQTPbBlVm.0G';
process.env.PUBLIC_URL = 'http://localhost:3000';
process.env.DATA_DIR = tmpDir;

// Initialise the encryption-key cache explicitly. db.ts also does this on
// import, but the pure-crypto test file doesn't depend on db.ts and the
// shared cachedKey would otherwise be null when it ran first.
setEncryptionKey(process.env.ENCRYPTION_KEY);

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});
