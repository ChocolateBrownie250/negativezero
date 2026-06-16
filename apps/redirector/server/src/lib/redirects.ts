import { randomBytes } from 'node:crypto';

// Every redirect is addressed by a 16-character hash that lives directly under
// the service root: negativezero.one/services/redirector/<hash>. The hash is
// minted server-side; the user only supplies the destination. Lowercase base36
// keeps the link copy-paste friendly and case-insensitive.
export const SLUG_LENGTH = 16;
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Matches exactly the shape generateSlug() produces. Used both to validate
// inbound /:slug requests and to constrain the public route so a hash can
// never shadow the SPA, the API, or a static asset path.
export const SLUG_PATTERN = `[a-z0-9]{${SLUG_LENGTH}}`;
const SLUG_RE = new RegExp(`^${SLUG_PATTERN}$`);

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function generateSlug(): string {
  const rand = randomBytes(SLUG_LENGTH);
  let s = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    s += SLUG_ALPHABET[rand[i] % SLUG_ALPHABET.length];
  }
  return s;
}

export class InvalidTargetError extends Error {
  constructor(message = 'invalid_target') {
    super(message);
    this.name = 'InvalidTargetError';
  }
}

// Normalize a user-supplied target into a canonical absolute http(s) URL.
// A bare "example.com/x" is treated as https. Anything that isn't http or
// https (javascript:, data:, mailto:, file:, …) is rejected — we only ever
// emit the result as a Location header, and only http(s) is safe to redirect
// a browser to.
export function normalizeTarget(input: string): string {
  const raw = input.trim();
  if (!raw) throw new InvalidTargetError();

  let candidate = raw;
  const schemeMatch = raw.match(/^([a-z][a-z0-9+.-]*):(.*)$/is);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    const rest = schemeMatch[2];
    if (rest.startsWith('//')) {
      // Authority-based scheme (scheme://…). Must be http or https — reject
      // ftp:, file:, ws:, etc.
      if (scheme !== 'http' && scheme !== 'https') throw new InvalidTargetError();
    } else if (!scheme.includes('.') && !/^\d/.test(rest)) {
      // Opaque scheme with no authority (mailto:, javascript:, data:, tel:).
      // A bare "host:port" is distinguished because the part before the colon
      // is a hostname (may contain a dot) and the part after starts with the
      // port digits — neither holds for these schemes, so reject.
      throw new InvalidTargetError();
    } else {
      // Bare "host:port[/path]" — no scheme. Default to https.
      candidate = `https://${raw}`;
    }
  } else {
    candidate = `https://${raw}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new InvalidTargetError();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidTargetError();
  }
  if (!url.hostname) throw new InvalidTargetError();
  return url.toString();
}
