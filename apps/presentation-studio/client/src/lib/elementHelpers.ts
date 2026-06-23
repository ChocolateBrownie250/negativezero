// Pure presentation-element helpers extracted from pages/Dashboard.tsx.
//
// These are stateless, referentially-transparent functions over the document
// model (no React state, no component closures) — read an ElementNode / Scene /
// document and derive a value or a style. Keeping them here shrinks the
// Dashboard monolith and makes them importable/testable on their own. Behaviour
// is unchanged from the in-component originals.
import type { CSSProperties } from 'react';
import type {
  Action,
  ElementNode,
  ElementStyle,
  PresentationDocument,
} from './presentation';
import { COLORS, RING_STRONG } from './colors';

export function frameStyle(element: ElementNode): CSSProperties {
  return {
    left: `${element.frame.x}%`,
    top: `${element.frame.y}%`,
    width: `${element.frame.width}%`,
    minHeight: `${element.frame.height}%`,
  };
}

export function textProp(element: ElementNode, key: string, fallback = ''): string {
  const value = element.props[key];
  return typeof value === 'string' ? value : fallback;
}

export function numberProp(element: ElementNode, key: string, fallback = 0): number {
  const value = element.props[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function listProp(element: ElementNode, key: string): string[] {
  return textProp(element, key)
    .split(/\n|->/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function safeImageHref(href: string): string | null {
  try {
    const url = new URL(href);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeColor(value?: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : COLORS.accent;
}

export function resolvedStyle(element: ElementNode): Required<ElementStyle> {
  return {
    tone: element.style?.tone ?? 'solid',
    radius: element.style?.radius ?? 'soft',
    accent: normalizeColor(element.style?.accent),
  };
}

export function radiusFor(style: ElementStyle | undefined): number {
  const radius = style?.radius ?? 'soft';
  if (radius === 'sharp') return 8;
  if (radius === 'pill') return 999;
  return 12;
}

export function elementSurfaceStyle(
  element: ElementNode,
  fallbackBackground = COLORS.card,
): CSSProperties {
  const style = resolvedStyle(element);
  const radius = radiusFor(style);
  if (style.tone === 'glass') {
    return {
      borderRadius: radius,
      background: 'rgba(255,255,255,0.045)',
      boxShadow: `inset 0 0 0 1px ${RING_STRONG}, 0 16px 44px rgba(0,0,0,0.18)`,
    };
  }
  if (style.tone === 'outline') {
    return {
      borderRadius: radius,
      background: 'rgba(255,255,255,0.012)',
      boxShadow: `inset 0 0 0 1px ${style.accent}`,
    };
  }
  return {
    borderRadius: radius,
    background: fallbackBackground,
    boxShadow: `0 0 0 1px ${RING_STRONG}, 0 20px 45px rgba(0,0,0,0.28)`,
  };
}

export function actionLabel(action?: Action): string {
  if (!action || action.kind === 'none') return 'No action';
  if (action.kind === 'scene') return `Scene: ${action.target}`;
  if (action.kind === 'anchor') return `Anchor: ${action.target}`;
  return action.href;
}

export function safeExternalHref(href: string): string | null {
  try {
    const url = new URL(href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function documentStats(document: PresentationDocument) {
  return {
    scenes: document.scenes.length,
    elements: document.scenes.reduce((total, scene) => total + scene.elements.length, 0),
    actions: document.scenes.reduce(
      (total, scene) =>
        total +
        scene.elements.filter((element) => element.action && element.action.kind !== 'none').length,
      0,
    ),
  };
}

export function publicAssetHref(path?: string): string | null {
  if (!path) return null;
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${path.replace(/^\/+/, '')}`;
}

export function elementDisplayName(element: ElementNode): string {
  if (element.type === 'headline') return textProp(element, 'title', element.id);
  if (element.type === 'button') return textProp(element, 'label', element.id);
  if (element.type === 'metric') return textProp(element, 'label', element.id);
  if (element.type === 'chart') return textProp(element, 'title', element.id);
  if (element.type === 'timeline') return 'Timeline';
  if (element.type === 'media') return textProp(element, 'title', element.id);
  if (element.type === 'quote') return 'Quote';
  if (element.type === 'checklist') return textProp(element, 'title', element.id);
  if (element.type === 'divider') return textProp(element, 'label', element.id);
  return textProp(element, 'title', element.id);
}
