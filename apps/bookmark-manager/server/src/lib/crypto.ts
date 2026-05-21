import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;
let cachedKeyHex = '';

export function setEncryptionKey(hex: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  cachedKeyHex = hex.toLowerCase();
  cachedKey = Buffer.from(cachedKeyHex, 'hex');
}

function key(): Buffer {
  if (!cachedKey) throw new Error('encryption key not initialized');
  return cachedKey;
}

const PREFIX = 'enc1:';

export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptString(value: string): string {
  if (!value.startsWith(PREFIX)) {
    // Tolerate legacy plaintext rows so a developer migrating from an unencrypted
    // build doesn't immediately lose their data. Fresh installs always store ciphertext.
    return value;
  }
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function encryptNullable(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  return encryptString(value);
}

export function decryptNullable(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  return decryptString(value);
}
