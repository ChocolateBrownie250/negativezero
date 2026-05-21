import { request } from 'undici';
import { parse } from 'node-html-parser';
import { assertPublicTarget, BlockedTargetError } from './ssrf.js';

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

async function fetchOnce(urlStr: string): Promise<{ body: string; finalUrl: string }> {
  const u = new URL(urlStr);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new BlockedTargetError();
  }
  await assertPublicTarget(u.hostname);

  const res = await request(urlStr, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BookmarkManager/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    maxRedirections: MAX_REDIRECTS,
    bodyTimeout: BODY_TIMEOUT,
    headersTimeout: HEADERS_TIMEOUT,
  });

  const finalUrl = (res.context as { history?: URL[] })?.history?.slice(-1)[0]?.toString() ?? urlStr;
  const finalHost = new URL(finalUrl).hostname;
  if (finalHost && finalHost !== u.hostname) {
    await assertPublicTarget(finalHost);
  }

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
  return { body, finalUrl };
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
