import { describe, it, expect } from 'vitest';
import {
  encryptString,
  decryptString,
  encryptNullable,
  decryptNullable,
} from '../lib/crypto.js';

describe('crypto', () => {
  it('roundtrips a string', () => {
    const plain = 'hello world';
    const ct = encryptString(plain);
    expect(ct.startsWith('enc1:')).toBe(true);
    expect(decryptString(ct)).toBe(plain);
  });

  it('produces a fresh IV for each call (different ciphertext for same input)', () => {
    const a = encryptString('same');
    const b = encryptString('same');
    expect(a).not.toBe(b);
    expect(decryptString(a)).toBe('same');
    expect(decryptString(b)).toBe('same');
  });

  it('rejects tampered ciphertext (GCM auth tag mismatch)', () => {
    const ct = encryptString('hello');
    const tampered = ct.slice(0, -4) + 'AAAA';
    expect(() => decryptString(tampered)).toThrow();
  });

  it('passes through legacy plaintext when missing the enc1: prefix', () => {
    expect(decryptString('plain text from old version')).toBe(
      'plain text from old version',
    );
  });

  it('throws on a too-short enc1: envelope', () => {
    expect(() => decryptString('enc1:short')).toThrow();
  });

  it('handles null in encryptNullable/decryptNullable', () => {
    expect(encryptNullable(null)).toBeNull();
    expect(decryptNullable(null)).toBeNull();
  });

  it('roundtrips unicode (CJK + emoji)', () => {
    const plain = 'hello 🌍 мир 中国';
    expect(decryptString(encryptString(plain))).toBe(plain);
  });

  it('roundtrips a long string (~10KB)', () => {
    const plain = 'a'.repeat(10_000);
    expect(decryptString(encryptString(plain))).toBe(plain);
  });

  // A user-typed string that happens to start with 'enc1:' must NOT be
  // mistaken for ciphertext when written through the encrypt boundary and
  // read back — the repair migration's safe-detector also relies on this.
  it('handles a string that starts with the enc1: prefix as plaintext', () => {
    const plain = 'enc1:notreallyciphertext';
    const ct = encryptString(plain);
    expect(decryptString(ct)).toBe(plain);
  });
});
