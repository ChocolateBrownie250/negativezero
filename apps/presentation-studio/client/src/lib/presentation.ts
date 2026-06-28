export type SceneLayout = 'viewport' | 'content' | 'aspect';
export type TransitionKind = 'instant' | 'fade' | 'slide' | 'scale' | 'reveal' | 'parallax';
export type ElementType =
  | 'headline'
  | 'body'
  | 'button'
  | 'metric'
  | 'chart'
  | 'timeline'
  | 'panel'
  | 'media'
  | 'quote'
  | 'checklist'
  | 'divider';
export type ElementComplexity = 'simple' | 'advanced';
export type ElementStyle = {
  tone?: 'solid' | 'glass' | 'outline';
  radius?: 'sharp' | 'soft' | 'pill';
  accent?: string;
};
export type Action =
  | { kind: 'none' }
  | { kind: 'scene'; target: string }
  | { kind: 'anchor'; target: string }
  | { kind: 'url'; href: string };

export type ElementFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasPosition = {
  x: number;
  y: number;
};

export type ElementNode = {
  id: string;
  type: ElementType;
  frame: ElementFrame;
  props: Record<string, string | number | boolean | Array<{ label: string; value: number }>>;
  style?: ElementStyle;
  action?: Action;
};

export type Scene = {
  id: string;
  title: string;
  layout: SceneLayout;
  transition: { kind: TransitionKind; durationMs: number };
  canvas?: CanvasPosition;
  elements: ElementNode[];
};

export type PresentationDocument = {
  version: 1;
  id: string;
  title: string;
  theme: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    line: string;
  };
  source: {
    status: 'pending_mcp_import' | 'imported';
    name: string;
    url: string;
    note: string;
    previewPath?: string;
    manifestPath?: string;
    downloadedArchive?: string;
    archiveSha256?: string;
    htmlSha256?: string;
    templateFamilyCount?: number;
  };
  scenes: Scene[];
};

export type ElementDefinition = {
  type: ElementType;
  label: string;
  description: string;
  complexity: ElementComplexity;
  defaultFrame: ElementFrame;
  defaultProps: ElementNode['props'];
  defaultStyle?: ElementStyle;
  defaultAction?: Action;
};

export const elementDefinitions: ElementDefinition[] = [
  {
    type: 'headline',
    label: 'Headline',
    description: 'Large editorial title block.',
    complexity: 'simple',
    defaultFrame: { x: 8, y: 12, width: 54, height: 18 },
    defaultStyle: { tone: 'glass', radius: 'soft' },
    defaultProps: {
      kicker: 'System',
      title: 'New narrative scene',
      subtitle: 'A web-native presentation moment built from reusable elements.',
    },
  },
  {
    type: 'body',
    label: 'Text',
    description: 'Compact supporting copy.',
    complexity: 'simple',
    defaultFrame: { x: 8, y: 34, width: 38, height: 18 },
    defaultStyle: { tone: 'glass', radius: 'soft' },
    defaultProps: {
      title: 'Point',
      body: 'Use concise writing that supports the scene instead of filling a slide.',
    },
  },
  {
    type: 'button',
    label: 'Action',
    description: 'Hyperlink-style navigation button.',
    complexity: 'simple',
    defaultFrame: { x: 8, y: 58, width: 22, height: 9 },
    defaultStyle: { tone: 'solid', radius: 'pill' },
    defaultProps: { label: 'Continue' },
    defaultAction: { kind: 'scene', target: 'system' },
  },
  {
    type: 'metric',
    label: 'Metric',
    description: 'Key number with a plain-language caption.',
    complexity: 'simple',
    defaultFrame: { x: 56, y: 16, width: 28, height: 18 },
    defaultStyle: { tone: 'solid', radius: 'soft' },
    defaultProps: { value: '3x', label: 'Reusable blocks', detail: 'Designed once, reused across scenes.' },
  },
  {
    type: 'chart',
    label: 'Chart',
    description: 'Accessible data-ready comparison block.',
    complexity: 'advanced',
    defaultFrame: { x: 52, y: 42, width: 36, height: 30 },
    defaultStyle: { tone: 'solid', radius: 'soft' },
    defaultProps: {
      title: 'Attention flow',
      data: [
        { label: 'Open', value: 72 },
        { label: 'Proof', value: 48 },
        { label: 'Ask', value: 61 },
      ],
    },
  },
  {
    type: 'timeline',
    label: 'Timeline',
    description: 'Sequence with motion-ready steps.',
    complexity: 'advanced',
    defaultFrame: { x: 8, y: 72, width: 78, height: 15 },
    defaultStyle: { tone: 'glass', radius: 'soft' },
    defaultProps: { steps: 'Brief -> Structure -> Scene -> Proof -> Action' },
  },
  {
    type: 'panel',
    label: 'Panel',
    description: 'Reusable surface for grouped content.',
    complexity: 'simple',
    defaultFrame: { x: 50, y: 12, width: 38, height: 56 },
    defaultStyle: { tone: 'solid', radius: 'soft' },
    defaultProps: {
      title: 'Premade element system',
      body: 'Panels scale with the scene grid and keep typography, spacing, and actions consistent.',
    },
  },
  {
    type: 'media',
    label: 'Media',
    description: 'Image or visual placeholder with caption.',
    complexity: 'simple',
    defaultFrame: { x: 54, y: 14, width: 34, height: 32 },
    defaultStyle: { tone: 'outline', radius: 'soft' },
    defaultProps: {
      title: 'Visual proof',
      src: '',
      alt: 'Presentation visual',
      caption: 'Use product, architecture, or evidence imagery.',
    },
  },
  {
    type: 'quote',
    label: 'Quote',
    description: 'Pull quote with source attribution.',
    complexity: 'simple',
    defaultFrame: { x: 8, y: 38, width: 40, height: 24 },
    defaultStyle: { tone: 'glass', radius: 'soft' },
    defaultProps: {
      quote: 'The best presentation is a navigable product surface.',
      source: 'Studio principle',
    },
  },
  {
    type: 'checklist',
    label: 'Checklist',
    description: 'Proof points, agenda, or acceptance criteria.',
    complexity: 'advanced',
    defaultFrame: { x: 52, y: 16, width: 34, height: 36 },
    defaultStyle: { tone: 'solid', radius: 'soft' },
    defaultProps: {
      title: 'Readiness',
      items: 'Narrative path\nReusable components\nAccessible data\nAction links',
    },
  },
  {
    type: 'divider',
    label: 'Divider',
    description: 'Section break, progress rule, or emphasis line.',
    complexity: 'advanced',
    defaultFrame: { x: 8, y: 68, width: 54, height: 8 },
    defaultStyle: { tone: 'outline', radius: 'pill' },
    defaultProps: {
      label: 'Next',
      progress: 42,
    },
  },
];

export const seedDocument: PresentationDocument = {
  version: 1,
  id: 'isg-studio-placeholder-seed',
  title: 'ISG Studio',
  theme: {
    background: '#07080b',
    surface: '#181c24',
    text: '#f4f5f8',
    muted: '#b4b9c4',
    accent: '#f2552f',
    line: 'rgba(255,255,255,0.18)',
  },
  source: {
    status: 'imported',
    name: 'ISG Studio.html',
    url: 'https://claude.ai/design/p/5d102e93-c0d0-47ef-9c69-fef1b0a646f4?file=ISG+Studio.html',
    note: 'Imported from the downloaded Claude Design template archive and preserved under protected server imports.',
    previewPath: 'api/source/isg-studio/ISG%20Studio.html',
    manifestPath: 'api/source/isg-studio/import-manifest.json',
    downloadedArchive: '/Users/magic/Downloads/[Template] tech-architecture-slides (2).zip',
    archiveSha256: '5d8bb2cc6a273db54122f60773e606a6cafa8e572cf056513b0fc9511eefdf65',
    htmlSha256: 'b62f71c5c132d0d66639cb8d83927146c7cac98463e2dda57e2a82bbd6d85783',
    templateFamilyCount: 15,
  },
  scenes: [
    {
      id: 'opening',
      title: 'Opening system',
      layout: 'viewport',
      transition: { kind: 'fade', durationMs: 420 },
      canvas: { x: 70, y: 80 },
      elements: [
        {
          id: 'opening-title',
          type: 'headline',
          frame: { x: 7, y: 12, width: 58, height: 24 },
          style: { tone: 'glass', radius: 'soft' },
          props: {
            kicker: 'ISG Studio',
            title: 'A presentation system, not a slide deck',
            subtitle: 'Narrative scenes, reusable elements, action navigation, and web-native transitions.',
          },
          action: { kind: 'scene', target: 'system' },
        },
        {
          id: 'opening-metric',
          type: 'metric',
          frame: { x: 70, y: 14, width: 20, height: 20 },
          style: { tone: 'solid', radius: 'soft' },
          props: { value: '01', label: 'Scene model', detail: 'Responsive from the first draft.' },
        },
        {
          id: 'opening-quote',
          type: 'quote',
          frame: { x: 44, y: 48, width: 42, height: 22 },
          style: { tone: 'glass', radius: 'soft' },
          props: {
            quote: 'Scenes behave like linked product states, not rectangular pages.',
            source: 'Design baseline',
          },
        },
        {
          id: 'opening-button',
          type: 'button',
          frame: { x: 7, y: 48, width: 22, height: 8 },
          style: { tone: 'solid', radius: 'pill' },
          props: { label: 'Open system' },
          action: { kind: 'scene', target: 'system' },
        },
      ],
    },
    {
      id: 'system',
      title: 'Element library',
      layout: 'viewport',
      transition: { kind: 'slide', durationMs: 520 },
      canvas: { x: 520, y: 250 },
      elements: [
        {
          id: 'system-panel',
          type: 'panel',
          frame: { x: 7, y: 10, width: 36, height: 58 },
          style: { tone: 'solid', radius: 'soft' },
          props: {
            title: 'Reusable by construction',
            body: 'Every premade element owns default props, responsive frame rules, inspector controls, and export serialization.',
          },
        },
        {
          id: 'system-chart',
          type: 'chart',
          frame: { x: 50, y: 12, width: 38, height: 34 },
          style: { tone: 'solid', radius: 'soft' },
          props: {
            title: 'Element maturity',
            data: [
              { label: 'Text', value: 86 },
              { label: 'Action', value: 74 },
              { label: 'Data', value: 62 },
            ],
          },
        },
        {
          id: 'system-timeline',
          type: 'timeline',
          frame: { x: 50, y: 52, width: 38, height: 14 },
          style: { tone: 'glass', radius: 'pill' },
          props: { steps: 'Scene -> Element -> Action -> Transition' },
        },
        {
          id: 'system-checklist',
          type: 'checklist',
          frame: { x: 50, y: 68, width: 38, height: 20 },
          style: { tone: 'glass', radius: 'soft' },
          props: {
            title: 'Advanced controls',
            items: 'Layout frame\nScene transition\nElement styling',
          },
        },
      ],
    },
  ],
};

export function cloneDocument(document: PresentationDocument): PresentationDocument {
  return JSON.parse(JSON.stringify(document)) as PresentationDocument;
}

export function newElement(type: ElementType, existingCount: number): ElementNode {
  const definition = elementDefinitions.find((item) => item.type === type) ?? elementDefinitions[0];
  return {
    id: `${type}-${existingCount + 1}`,
    type,
    frame: { ...definition.defaultFrame },
    props: cloneValue(definition.defaultProps),
    style: definition.defaultStyle ? { ...definition.defaultStyle } : { tone: 'solid', radius: 'soft' },
    action: definition.defaultAction ? { ...definition.defaultAction } : { kind: 'none' },
  };
}

export function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
}

// A fresh, near-empty deck for "New presentation" — reuses the seed's theme so
// it looks on-brand, but starts with a single title scene the user fills in.
export function blankDocument(title: string, idSuffix: string): PresentationDocument {
  const base = cloneValue(seedDocument);
  const sceneId = `scene-${idSuffix}`;
  const headline = newElement('headline', 0);
  const body = newElement('body', 1);
  return {
    ...base,
    id: `deck-${idSuffix}`,
    title,
    source: { ...base.source, status: 'pending_mcp_import' },
    scenes: [
      {
        id: sceneId,
        title: 'Title slide',
        layout: 'viewport',
        transition: { kind: 'fade', durationMs: 360 },
        canvas: { x: 0, y: 0 },
        elements: [
          {
            ...headline,
            id: `${sceneId}-headline`,
            frame: { x: 8, y: 20, width: 74, height: 26 },
            props: { kicker: '', title, subtitle: 'Double-click to edit · drag to move' },
          },
          {
            ...body,
            id: `${sceneId}-body`,
            frame: { x: 8, y: 52, width: 74, height: 22 },
            props: {
              title: 'Add your content',
              text: 'Pick elements from the left, drop them on the slide, drag to move, and resize with the handles.',
            },
          },
        ],
      },
    ],
  };
}
