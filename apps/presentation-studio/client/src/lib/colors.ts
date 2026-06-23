// Deep-blue "liquid glass" dark theme — the shared negativezero platform
// palette (Amethyst / Basalt / admin / redirector / video-downloader). The base
// was re-pointed from the old Apple-HIG greyscale so Citrine's editor chrome
// matches every other service. `accent` is kept as Citrine's warm gem highlight
// (used for element/selection accents in the editor) — its identity color.
export const COLORS = {
  bg: '#03050d',      // near-black, blue cast
  surface: '#121d3a', // raised blue
  card: '#0d1730',    // deep-blue panel
  ink: '#eef2fa',
  muted: '#6b7491',
  accent: '#f2552f',  // citrine warm accent (element/selection highlight) — kept
  blue: '#5b93f0',
  green: '#56e0b0',
  red: '#ff6a86',
  yellow: '#ffd60a',
};

export const RING_STRONG = 'rgba(150, 178, 235, 0.16)';
export const RING_SUBTLE = 'rgba(150, 178, 235, 0.09)';
export const LABEL_PRIMARY = COLORS.ink;
export const LABEL_SECONDARY = '#9aa4bd';
export const LABEL_TERTIARY = COLORS.muted;
