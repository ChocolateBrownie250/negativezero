export const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function externalLinkHref(url: string): string {
  if (!IS_IOS) return url;
  if (/^https?:\/\//i.test(url)) return 'x-safari-' + url;
  return url;
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
