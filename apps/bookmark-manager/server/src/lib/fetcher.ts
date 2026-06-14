import { request, Agent } from 'undici';
import { parse } from 'node-html-parser';
import { resolvePublicAddresses, BlockedTargetError, type VettedAddress } from './ssrf.js';

const MAX_BYTES = 1_000_000; // 1 MB
const HEADERS_TIMEOUT = 4000;
const BODY_TIMEOUT = 8000;
const MAX_REDIRECTS = 5;

export type FetchedMetadata = {
  title: string | null;
  faviconUrl: string | null;
  finalUrl: string;
};

function defaultFaviconFor(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    throw new Error('invalid_scheme');
  }
  return 'https://' + trimmed;
}

// Build an undici dispatcher that pins every connection it makes to the
// already-vetted IPs. undici's connector passes a custom `lookup` straight
// through to net/tls.connect, so the address dialed is exactly an address we
// checked — closing the DNS-rebinding TOCTOU window between the SSRF check and
// the socket dial. SNI / Host header stay the original hostname (the connector
// derives servername from `host`, not from the resolved address), so TLS and
// virtual hosting still work.
//
// The lookup honors Node's dns.lookup contract: when called with `{ all: true }`
// it must return an array of { address, family }; otherwise it invokes the
// callback with (err, address, family). Node's net layer uses the `all` form,
// but we support both for safety.
function pinnedLookup(
  addresses: VettedAddress[],
): (
  hostname: string,
  options: { all?: boolean } | undefined,
  cb: (
    err: NodeJS.ErrnoException | null,
    address: string | VettedAddress[],
    family?: number,
  ) => void,
) => void {
  return (_hostname, options, cb) => {
    if (options && options.all) {
      cb(null, addresses);
    } else {
      cb(null, addresses[0].address, addresses[0].family);
    }
  };
}

function pinnedAgent(addresses: VettedAddress[]): Agent {
  return new Agent({
    connect: {
      lookup: pinnedLookup(addresses) as never,
    },
  });
}

async function fetchOnce(urlStr: string): Promise<{ body: string; finalUrl: string }> {
  // Manual redirect handling — keeps the SSRF guard honest per hop (every
  // intermediate Location: target gets DNS-resolved and rejected if it
  // points at private/loopback space) and removes the dependency on
  // undici's internal `res.context.history` shape, which went private
  // when the redirect interceptor landed in undici 7+.
  let current = urlStr;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new BlockedTargetError();
    }
    // Resolve + vet once per hop, then PIN the dial to a vetted IP so the
    // address we just checked is the address we actually connect to.
    const vetted = await resolvePublicAddresses(u.hostname);
    const dispatcher = pinnedAgent(vetted);

    let res;
    try {
      res = await request(current, {
        method: 'GET',
        dispatcher,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BookmarkManager/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        bodyTimeout: BODY_TIMEOUT,
        headersTimeout: HEADERS_TIMEOUT,
      });
    } catch (err) {
      // Tear down the pinned dispatcher before propagating so we don't leak
      // the per-hop agent's sockets.
      dispatcher.close().catch(() => {});
      throw err;
    }

    if (res.statusCode >= 300 && res.statusCode < 400) {
      const location = res.headers['location'];
      const locStr = Array.isArray(location) ? location[0] : location;
      if (!locStr) {
        // 3xx with no Location → treat as terminal, fall through to body read
      } else {
        // Drain so the connection returns to the pool, then tear down this
        // hop's pinned dispatcher — the next hop re-resolves and re-pins.
        res.body.resume();
        dispatcher.close().catch(() => {});
        if (hop === MAX_REDIRECTS) {
          throw new Error('too_many_redirects');
        }
        current = new URL(locStr, current).toString();
        continue;
      }
    }

    try {
      let received = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of res.body) {
        const buf = chunk as Buffer;
        received += buf.length;
        if (received > MAX_BYTES) {
          chunks.push(buf.subarray(0, Math.max(0, MAX_BYTES - (received - buf.length))));
          try {
            res.body.destroy();
          } catch {
            // ignore
          }
          break;
        }
        chunks.push(buf);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      return { body, finalUrl: current };
    } finally {
      dispatcher.close().catch(() => {});
    }
  }
  // Loop exit only happens via return/throw above; this is unreachable but
  // keeps the type checker happy without a non-null assertion.
  throw new Error('too_many_redirects');
}

function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const text = decodeEntities(titleMatch[1].replace(/\s+/g, ' ').trim());
    if (text) return text;
  }
  try {
    const root = parse(html);
    const og = root.querySelector('meta[property="og:title"]');
    const content = og?.getAttribute('content');
    if (content && content.trim()) return decodeEntities(content.trim());
  } catch {
    // ignore
  }
  return null;
}

function extractFavicon(html: string, finalUrl: string): string | null {
  let root;
  try {
    root = parse(html);
  } catch {
    return defaultFaviconFor(finalUrl);
  }
  const candidates = [
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="apple-touch-icon-precomposed"]',
  ];
  for (const sel of candidates) {
    const el = root.querySelector(sel);
    const href = el?.getAttribute('href');
    if (href) {
      try {
        return new URL(href, finalUrl).toString();
      } catch {
        // fall through
      }
    }
  }
  return defaultFaviconFor(finalUrl);
}

export async function fetchMetadata(urlInput: string): Promise<FetchedMetadata & { url: string }> {
  let normalized: string;
  try {
    normalized = normalizeUrl(urlInput);
  } catch {
    return { url: urlInput, title: null, faviconUrl: null, finalUrl: urlInput };
  }

  try {
    const { body, finalUrl } = await fetchOnce(normalized);
    const title = extractTitle(body);
    const faviconUrl = extractFavicon(body, finalUrl);
    return { url: normalized, title, faviconUrl, finalUrl };
  } catch (err) {
    if (err instanceof BlockedTargetError) throw err;
    return {
      url: normalized,
      title: null,
      faviconUrl: defaultFaviconFor(normalized),
      finalUrl: normalized,
    };
  }
}

export { BlockedTargetError };
export { normalizeUrl };
