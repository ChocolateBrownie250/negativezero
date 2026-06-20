import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timezones-test-'));

process.env.NODE_ENV = 'test';
process.env.SSO_SESSION_SECRET = 'test-sso-secret-aaaaaaaaaaaaaaaaaaaa';
// ADMIN_AUTHZ_URL is deliberately left unset → authorizeService returns 'allow'
// for any valid SSO cookie, which is the surface these tests exercise.
delete process.env.ADMIN_AUTHZ_URL;
process.env.DATA_DIR = tmpDir;

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
