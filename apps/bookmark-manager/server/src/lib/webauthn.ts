import { config } from '../config.js';

function deriveOriginAndRpId(): { origin: string; rpId: string } {
  if (config.publicUrl) {
    try {
      const u = new URL(config.publicUrl);
      return { origin: u.origin, rpId: u.hostname };
    } catch {
      // fall through
    }
  }
  // Dev fallback. The browser will use whatever origin it sees;
  // localhost is the only special-cased value WebAuthn allows.
  return { origin: `http://localhost:${config.port}`, rpId: 'localhost' };
}

export const RP_NAME = 'Bookmarks';
export const { origin: RP_ORIGIN, rpId: RP_ID } = deriveOriginAndRpId();
export const RP_USER_ID = new TextEncoder().encode('owner');
export const RP_USER_NAME = 'owner';

export function isLikelyLocalhost(): boolean {
  return RP_ID === 'localhost' || RP_ID === '127.0.0.1';
}
