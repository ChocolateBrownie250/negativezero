import { config } from '../config.js';

function deriveOriginAndRpId(): { origin: string; rpId: string } {
  if (config.publicUrl) {
    try {
      const u = new URL(config.publicUrl);
      return { origin: u.origin, rpId: u.hostname };
    } catch {
      // fall through to dev default
    }
  }
  return { origin: `http://localhost:${config.port}`, rpId: 'localhost' };
}

export const RP_NAME = 'negativezero redirector';
export const { origin: RP_ORIGIN, rpId: RP_ID } = deriveOriginAndRpId();
export const RP_USER_ID = new TextEncoder().encode('owner');
export const RP_USER_NAME = 'redirector';
