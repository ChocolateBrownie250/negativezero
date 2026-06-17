// Design tokens — Amethyst "liquid glass" deep-blue dark theme.
// Re-pointed from the old flat iOS-HIG greyscale to match the Amethyst PWA
// (apps/tts/pwa/styles.css). The CSS custom properties live in styles.css
// (:root); these JS constants mirror them so the many inline `style={{...}}`
// usages across components pick up the new palette without a per-file rewrite.
// Glass surfaces (blur + translucency) are applied via the .glass-* classes
// in styles.css on the key containers (login card, modals, menus, list, toast).

export const COLORS = {
  bg: '#03050d', // near-black with a blue cast (--bg0)
  card: '#0d1730', // deep-blue panel (solid fallback under glass surfaces)
  surface: '#121d3a', // raised blue
  raised: '#1a2748',
  raisedHover: '#22315a',
  blue: '#5b93f0', // accent (--ac)
  red: '#ff6a86', // danger
  green: '#56e0b0', // ok
};

export const LABEL_PRIMARY = '#eef2fa';
export const LABEL_SECONDARY = '#9aa4bd';
export const LABEL_TERTIARY = '#6b7491';
export const LABEL_QUATERNARY = '#49526c';

export const SEPARATOR = 'rgba(150,178,235,0.10)';
export const RING_SUBTLE = 'rgba(150,178,235,0.09)';
export const RING_STRONG = 'rgba(150,178,235,0.16)';

export const SF_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
