import { randomBytes } from 'node:crypto';

// Confusion-free alphabet — no 0/O, 1/I/l, no vowels (to avoid accidental words).
// 26-char alphabet keeps each char ~4.7 bits of entropy.
const ALPHABET = '23456789BCDFGHJKLMNPQRSTVWXZ';

function pickChar(): string {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

// Cryptographically-strong pick. Math.random() above only used in fallback for
// platforms without crypto.randomBytes; in Node we always go through this path.
function pickCryptoChar(rand: Buffer, i: number): string {
  return ALPHABET[rand[i] % ALPHABET.length];
}

// Backup-code-style format: 4 groups of 4, hyphen-separated (XXXX-XXXX-XXXX-XXXX).
// 16 chars * ~4.7 bits/char ≈ 75 bits of entropy. Easy to read/copy aloud.
export function generateRegistrationCode(): string {
  const rand = randomBytes(16);
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let chunk = '';
    for (let i = 0; i < 4; i++) chunk += pickCryptoChar(rand, g * 4 + i);
    groups.push(chunk);
  }
  return groups.join('-');
}

export function normalizeCode(input: string): string {
  return input.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

// kept for parity with bookmark-manager's lib/codes.ts (referenced by docs)
export const generateBackupCode = generateRegistrationCode;
export { pickChar };
