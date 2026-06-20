import type { PresetSelection } from '../db.js';

// IANA zone ids look like "Europe/Riga", "America/Argentina/Buenos_Aires", "UTC".
const IANA_RE = /^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/;
export const MAX_ZONES = 50;
export const MAX_NAME = 60;

export class InvalidSelectionError extends Error {}

// Validate + normalize an untrusted selection payload into a PresetSelection.
// Throws InvalidSelectionError (with the offending field as the message) on
// anything malformed — we never store unvalidated client JSON.
export function parseSelection(input: unknown): PresetSelection {
  if (!input || typeof input !== 'object') throw new InvalidSelectionError('selection');
  const o = input as Record<string, unknown>;

  if (!Array.isArray(o.zones) || o.zones.length === 0 || o.zones.length > MAX_ZONES) {
    throw new InvalidSelectionError('zones');
  }
  const zones = o.zones.map((z) => {
    if (typeof z !== 'string' || z.length > 100 || !IANA_RE.test(z)) {
      throw new InvalidSelectionError('zones');
    }
    return z;
  });

  if (typeof o.home !== 'string' || !zones.includes(o.home)) {
    throw new InvalidSelectionError('home');
  }

  if (
    !Array.isArray(o.work) ||
    o.work.length !== 2 ||
    !o.work.every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 24)
  ) {
    throw new InvalidSelectionError('work');
  }
  const work: [number, number] = [o.work[0] as number, o.work[1] as number];

  const fmt24 = o.fmt24 !== false;

  return { zones, home: o.home, work, fmt24 };
}

export function cleanName(input: unknown): string {
  if (typeof input !== 'string') throw new InvalidSelectionError('name');
  const name = input.trim();
  if (!name) throw new InvalidSelectionError('name');
  return name.slice(0, MAX_NAME);
}
