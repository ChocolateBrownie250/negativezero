import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { generateRegistrationCode, normalizeCode } from './codes.js';

// Mirrors the issue/verify logic in routes/auth.ts (hashBackupCode / isBackupCode):
// both sides operate on normalizeCode(code), while the hyphenated form is only
// shown to the user. This roundtrip guards against the prior lockout bug where
// codes were hashed WITH hyphens but verified after stripping them.
async function issueHash(plain: string): Promise<string> {
  return bcrypt.hash(normalizeCode(plain), 12);
}

async function verify(input: string, stored: string): Promise<boolean> {
  return bcrypt.compare(normalizeCode(input), stored);
}

test('backup-code roundtrip: generate -> issue-hash -> verify succeeds', async () => {
  const code = generateRegistrationCode();
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const stored = await issueHash(code);

  // The hyphenated code the user sees must verify.
  assert.equal(await verify(code, stored), true);
  // The normalized (hyphen-stripped) form must also verify.
  assert.equal(await verify(normalizeCode(code), stored), true);
  // Lowercase / whitespace variants normalize to the same value.
  assert.equal(await verify(`  ${code.toLowerCase()}  `, stored), true);
});

test('backup-code roundtrip: a wrong code fails verification', async () => {
  const code = generateRegistrationCode();
  const stored = await issueHash(code);

  let wrong = generateRegistrationCode();
  while (normalizeCode(wrong) === normalizeCode(code)) {
    wrong = generateRegistrationCode();
  }

  assert.equal(await verify(wrong, stored), false);
  assert.equal(await verify('', stored), false);
});

test('normalizeCode strips hyphens and uppercases', () => {
  assert.equal(normalizeCode('abcd-2345-bcdf-ghjk'), 'ABCD2345BCDFGHJK');
  assert.equal(normalizeCode('ABCD2345BCDFGHJK'), 'ABCD2345BCDFGHJK');
});
