import { randomBytes } from 'node:crypto';

// Crockford-ish base32 minus ambiguous characters
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateBackupCode(): string {
  const bytes = randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}

export function normalizeCode(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}
