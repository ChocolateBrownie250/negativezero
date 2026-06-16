import { randomBytes } from 'node:crypto';

// Every redirect is addressed by a 16-character hash that lives directly under
// the service root: negativezero.one/services/redirector/<hash>. The hash is
// minted server-side; the user only supplies the destination. Lowercase base36
// keeps the link copy-paste friendly.
export const SLUG_LENGTH = 16;
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Matches exactly the shape generateSlug() produces. Used both to validate
// inbound /:slug requests and to constrain the public route so a hash can
// never shadow the SPA, the API, or a static asset path.
export const SLUG_PATTERN = `[a-z0-9]{${SLUG_LENGTH}}`;
const SLUG_RE = new RegExp(`^${SLUG_PATTERN}$`);

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

const MAX_TARGET_LEN = 2048;

// Normalize a user-supplied target into a canonical absolute http(s) URL.
//   - Explicit http://… / https://… is used as-is.
//   - An explicit non-http(s) authority scheme (ftp://, ws://, file://) is
//     rejected outright.
//   - Anything else (a bare "example.com/x", "host:port/x") is treated as
//     https.
// The final protocol/host check is the real guard: whatever we store is only
// ever emitted as a Location header, and only an http(s) URL with a host is
// safe to redirect a browser to.
export function normalizeTarget(input: string): string {
  const raw = input.trim();
  if (!raw || raw.length > MAX_TARGET_LEN) throw new InvalidTargetError();

  let candidate: string;
  if (/^https?:\/\//i.test(raw)) {
    candidate = raw;
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    throw new InvalidTargetError();
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
