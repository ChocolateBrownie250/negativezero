import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redirector-test-'));

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.SETUP_CODE_HASH =
  '$2b$12$KIXxPfnK5DYZIyf68aVVoOJ.aWdMRPYJM6Sl8u7lYZQTPbBlVm.0G';
process.env.PUBLIC_URL = 'http://localhost:3000';
process.env.DATA_DIR = tmpDir;

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
