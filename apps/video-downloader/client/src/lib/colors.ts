// Deep-blue "liquid glass" dark theme, kept in sync with the Amethyst PWA,
// Basalt, redirector, and admin so every service looks like one platform.
// (Was the old flat Apple-HIG greyscale; re-pointed to the blue palette —
// keys are unchanged so every screen picks up the new values automatically.)
export const COLORS = {
  bg: '#03050d',      // near-black, blue cast
  surface: '#121d3a', // raised blue
  card: '#0d1730',    // deep-blue panel
  ink: '#eef2fa',
  muted: '#6b7491',
  blue: '#5b93f0',    // accent
  green: '#56e0b0',
  red: '#ff6a86',
  yellow: '#ffd60a',
};

export const RING_STRONG = 'rgba(150, 178, 235, 0.16)';
export const RING_SUBTLE = 'rgba(150, 178, 235, 0.09)';
export const LABEL_PRIMARY = COLORS.ink;
export const LABEL_SECONDARY = '#9aa4bd';
export const LABEL_TERTIARY = COLORS.muted;
