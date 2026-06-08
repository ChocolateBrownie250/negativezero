// Extract a list of URLs from free-form pasted text. This handles the
// "I selected 20 tabs in Safari on iPhone and copied them" case, where the
// links arrive separated by newlines, spaces, tabs, commas, or semicolons.
//
// Tokens without an explicit scheme are assumed to be https. Tokens that
// don't look like a web address are dropped. Duplicates are removed while
// preserving first-seen order. Final validation/normalization still happens
// server-side when each bookmark is created.
export function parseLinks(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const url = normalizeToken(raw);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

function normalizeToken(raw: string): string | null {
  // Strip wrapping punctuation that often rides along with a pasted link:
  // angle brackets, quotes, parens, and trailing commas/periods.
  const t = raw.trim().replace(/^[<("']+/, '').replace(/[>)"'.,]+$/, '');
  if (!t) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t);
  // Reject non-web schemes (mailto:, javascript:, file:, …).
  if (hasScheme && !/^https?:\/\//i.test(t)) return null;

  const candidate = hasScheme ? t : `https://${t}`;
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  // A scheme-less token like "mailto:foo@bar.com" becomes
  // "https://mailto:foo@bar.com" once a scheme is prepended, which parses
  // with userinfo. Pasted web links don't carry credentials, so drop these.
  if (u.username || u.password) return null;

  // The host must look like a real domain (a dot followed by a plausible
  // TLD) or be localhost. This filters out stray words that happen to parse
  // as a URL once "https://" is prepended.
  const host = u.hostname;
  if (host !== 'localhost' && !/\.[a-z]{2,}$/i.test(host)) return null;

  return u.toString();
}
