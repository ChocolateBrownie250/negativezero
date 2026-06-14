export const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// Returns true only for http(s) URLs. Anything else (javascript:, data:,
// file:, vbscript:, blob:, etc.) must never be turned into a live href —
// defense-in-depth against a hostile URL that slipped past the server.
export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Returns a safe href for an external link, or null when the URL is not a
// plain http(s) URL. Callers MUST treat null as "do not render a live link".
export function externalLinkHref(url: string): string | null {
  if (!isSafeHttpUrl(url)) return null;
  if (!IS_IOS) return url;
  return 'x-safari-' + url;
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
