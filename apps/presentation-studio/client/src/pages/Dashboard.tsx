import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  Hand,
  Image as ImageIcon,
  LayoutTemplate,
  Link as LinkIcon,
  ListChecks,
  LogOut,
  Maximize2,
  Minus,
  MousePointer2,
  PanelRight,
  Plus,
  Quote,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api, UnauthorizedError } from '../api';
import {
  clearStoredDocument,
  loadStoredDocument,
  saveStoredDocument,
} from '../lib/storage';
import {
  cloneValue,
  elementDefinitions,
  newElement,
  blankDocument,
  seedDocument,
  slug,
  type Action,
  type ElementNode,
  type ElementStyle,
  type ElementType,
  type PresentationDocument,
  type Scene,
  type SceneLayout,
  type TransitionKind,
} from '../lib/presentation';
import {
  COLORS,
  LABEL_SECONDARY,
  LABEL_TERTIARY,
  RING_STRONG,
  RING_SUBTLE,
} from '../lib/colors';
import {
  actionLabel,
  documentStats,
  elementDisplayName,
  elementSurfaceStyle,
  frameStyle,
  listProp,
  normalizeColor,
  numberProp,
  publicAssetHref,
  radiusFor,
  resolvedStyle,
  safeExternalHref,
  safeImageHref,
  textProp,
} from '../lib/elementHelpers';

interface Props {
  isOffline: boolean;
  onUnauthorized: () => void;
}

type Mode = 'edit' | 'preview';
type EditLevel = 'simple' | 'advanced';
type SurfaceMode = 'stage' | 'canvas';
type CanvasTouchMode = 'pan' | 'move';
type MobilePanel = 'scenes' | 'elements' | 'inspector' | 'actions' | null;
type ValidationState =
  | { status: 'idle' }
  | { status: 'checking' }
  | {
      status: 'checked';
      valid: boolean;
      diagnostics: Array<{ level: 'error' | 'warning'; path: string; message: string }>;
      stats: { scenes: number; elements: number; actions: number };
    };

const EDIT_LEVEL_STORAGE_KEY = 'negativezero:citrine:edit-level';
const TRANSITION_OPTIONS: TransitionKind[] = ['instant', 'fade', 'slide', 'scale', 'reveal', 'parallax'];
const LAYOUT_OPTIONS: SceneLayout[] = ['viewport', 'content', 'aspect'];
const MULTILINE_PROPS = new Set(['body', 'subtitle', 'quote', 'items', 'caption']);
const CANVAS_PAGE_WIDTH = 320;
const CANVAS_PAGE_HEIGHT = 220;
const CANVAS_ZOOM_MIN = 0.55;
const CANVAS_ZOOM_MAX = 1.35;
const CANVAS_ZOOM_STEP = 0.1;

function loadEditLevel(): EditLevel {
  try {
    return window.localStorage.getItem(EDIT_LEVEL_STORAGE_KEY) === 'advanced' ? 'advanced' : 'simple';
  } catch {
    return 'simple';
  }
}

function defaultCanvasPosition(index: number): { x: number; y: number } {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 70 + column * 450,
    y: 80 + row * 340 + (column === 1 ? 70 : 0),
  };
}

function sceneCanvasPosition(scene: Scene, index: number): { x: number; y: number } {
  return scene.canvas ?? defaultCanvasPosition(index);
}

function prefersTouchCanvasPan(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

function clampCanvasZoom(value: number): number {
  return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, Math.round(value * 100) / 100));
}

function ElementView({
  element,
  selected,
  mode,
  onSelect,
  onAction,
}: {
  element: ElementNode;
  selected: boolean;
  mode: Mode;
  onSelect: () => void;
  onAction: (action?: Action) => void;
}) {
  const action = element.action;
  const clickable = mode === 'preview' && action && action.kind !== 'none';
  const baseClass =
    `stage-element stage-element-${element.type} absolute text-left transition-[box-shadow,transform,border-color] duration-200`;
  const selectedRing = selected && mode === 'edit' ? `0 0 0 2px ${COLORS.accent}` : undefined;
  const accent = resolvedStyle(element).accent;

  function handleClick() {
    if (mode === 'edit') onSelect();
    else if (clickable) onAction(action);
  }

  if (element.type === 'headline') {
    const surface = elementSurfaceStyle(element, 'transparent');
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} rounded-2xl p-5`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: COLORS.ink,
          background: element.style?.tone ? surface.background : 'transparent',
          boxShadow: selectedRing ?? (element.style?.tone ? surface.boxShadow : undefined),
        }}
      >
        <div className="text-[11px] uppercase tracking-[0.16em] mb-3" style={{ color: accent }}>
          {textProp(element, 'kicker', 'Scene')}
        </div>
        <div className="text-[34px] leading-[1.02] font-semibold mb-4 max-[780px]:text-[24px]">
          {textProp(element, 'title', 'Headline')}
        </div>
        <div className="text-[15px] leading-6 max-w-xl" style={{ color: LABEL_SECONDARY }}>
          {textProp(element, 'subtitle', 'Supporting text')}
        </div>
      </button>
    );
  }

  if (element.type === 'body') {
    const surface = elementSurfaceStyle(element, 'rgba(255,255,255,0.035)');
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} rounded-xl p-4`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: COLORS.ink,
          boxShadow: selectedRing ?? surface.boxShadow ?? `inset 0 0 0 1px ${RING_SUBTLE}`,
        }}
      >
        <div className="text-[13px] font-semibold mb-2">{textProp(element, 'title', 'Point')}</div>
        <div className="text-[13px] leading-5" style={{ color: LABEL_SECONDARY }}>
          {textProp(element, 'body', 'Body copy')}
        </div>
      </button>
    );
  }

  if (element.type === 'button') {
    const surface = elementSurfaceStyle(element, accent);
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} rounded-full px-5 py-3 inline-flex items-center justify-between gap-3 font-semibold`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: '#fff',
          background: element.style?.tone === 'outline' ? 'transparent' : surface.background,
          boxShadow: selectedRing ?? surface.boxShadow ?? 'inset 0 1px 0 rgba(255,255,255,0.22)',
        }}
      >
        <span className="text-[14px]">{textProp(element, 'label', 'Continue')}</span>
        <ArrowRight size={16} />
      </button>
    );
  }

  if (element.type === 'metric') {
    const surface = elementSurfaceStyle(element, COLORS.card);
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} rounded-2xl p-4`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: COLORS.ink,
          boxShadow: selectedRing ?? surface.boxShadow,
        }}
      >
        <div className="text-[34px] leading-none font-semibold mb-3" style={{ color: accent }}>{textProp(element, 'value', '01')}</div>
        <div className="text-[13px] font-medium mb-1">{textProp(element, 'label', 'Metric')}</div>
        <div className="text-[12px] leading-4" style={{ color: LABEL_TERTIARY }}>
          {textProp(element, 'detail', 'Detail')}
        </div>
      </button>
    );
  }

  if (element.type === 'chart') {
    const data = Array.isArray(element.props.data)
      ? (element.props.data as Array<{ label: string; value: number }>)
      : [];
    const max = Math.max(1, ...data.map((item) => Number(item.value) || 0));
    const surface = elementSurfaceStyle(element, COLORS.card);
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} rounded-2xl p-4`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: COLORS.ink,
          boxShadow: selectedRing ?? surface.boxShadow,
        }}
        aria-label={`${textProp(element, 'title', 'Chart')}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold mb-4">
          <BarChart3 size={15} color={accent} />
          {textProp(element, 'title', 'Chart')}
        </div>
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.label}>
              <div className="flex justify-between text-[12px] mb-1" style={{ color: LABEL_SECONDARY }}>
                <span>{item.label}</span>
                <span>{item.value}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: COLORS.surface }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(4, (item.value / max) * 100)}%`, background: accent }}
                />
              </div>
            </div>
          ))}
        </div>
      </button>
    );
  }

  if (element.type === 'timeline') {
    const steps = textProp(element, 'steps', '').split('->').map((step) => step.trim()).filter(Boolean);
    const surface = elementSurfaceStyle(element, 'rgba(255,255,255,0.035)');
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} rounded-2xl p-4`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: COLORS.ink,
          boxShadow: selectedRing ?? surface.boxShadow,
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((step, index) => (
            <div key={`${step}-${index}`} className="flex items-center gap-2 min-w-0">
              <span
                className="rounded-full px-3 py-1 text-[12px] whitespace-nowrap"
                style={{ background: index === 0 ? accent : COLORS.surface, color: '#fff' }}
              >
                {step}
              </span>
              {index < steps.length - 1 && <ArrowRight size={13} color={LABEL_TERTIARY} />}
            </div>
          ))}
        </div>
      </button>
    );
  }

  if (element.type === 'media') {
    const src = safeImageHref(textProp(element, 'src'));
    const surface = elementSurfaceStyle(element, COLORS.card);
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} overflow-hidden p-0`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: COLORS.ink,
          boxShadow: selectedRing ?? surface.boxShadow,
        }}
      >
        <div className="h-[68%] w-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {src ? (
            <img
              src={src}
              alt={textProp(element, 'alt', 'Presentation visual')}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <ImageIcon size={32} color={accent} />
            </div>
          )}
        </div>
        <div className="p-3">
          <div className="text-[13px] font-semibold mb-1">{textProp(element, 'title', 'Media')}</div>
          <div className="text-[12px] leading-4" style={{ color: LABEL_TERTIARY }}>
            {textProp(element, 'caption', 'Caption')}
          </div>
        </div>
      </button>
    );
  }

  if (element.type === 'quote') {
    const surface = elementSurfaceStyle(element, COLORS.card);
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} p-5`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: COLORS.ink,
          boxShadow: selectedRing ?? surface.boxShadow,
        }}
      >
        <Quote size={18} color={accent} className="mb-3" />
        <div className="text-[19px] leading-[1.18] font-semibold mb-4">
          {textProp(element, 'quote', 'Quote')}
        </div>
        <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: LABEL_TERTIARY }}>
          {textProp(element, 'source', 'Source')}
        </div>
      </button>
    );
  }

  if (element.type === 'checklist') {
    const items = listProp(element, 'items');
    const surface = elementSurfaceStyle(element, COLORS.card);
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} p-4`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: COLORS.ink,
          boxShadow: selectedRing ?? surface.boxShadow,
        }}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold mb-4">
          <ListChecks size={15} color={accent} />
          {textProp(element, 'title', 'Checklist')}
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item} className="flex items-start gap-2 text-[12px] leading-4" style={{ color: LABEL_SECONDARY }}>
              <CheckCircle2 size={13} color={accent} className="mt-0.5 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </button>
    );
  }

  if (element.type === 'divider') {
    const progress = Math.max(0, Math.min(100, numberProp(element, 'progress', 50)));
    const surface = elementSurfaceStyle(element, 'transparent');
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${baseClass} flex items-center gap-3 px-3 py-2`}
        style={{
          ...frameStyle(element),
          ...surface,
          color: COLORS.ink,
          background: 'transparent',
          boxShadow: selectedRing ?? surface.boxShadow,
        }}
      >
        <span className="text-[11px] uppercase tracking-[0.16em] shrink-0" style={{ color: LABEL_TERTIARY }}>
          {textProp(element, 'label', 'Section')}
        </span>
        <span className="h-px flex-1 overflow-hidden rounded-full" style={{ background: RING_STRONG }}>
          <span className="block h-full rounded-full" style={{ width: `${progress}%`, background: accent }} />
        </span>
        <Minus size={14} color={accent} />
      </button>
    );
  }

  const surface = elementSurfaceStyle(element, COLORS.card);
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${baseClass} rounded-2xl p-5`}
      style={{
        ...frameStyle(element),
        ...surface,
        color: COLORS.ink,
        boxShadow: selectedRing ?? surface.boxShadow,
      }}
    >
      <div className="text-[16px] font-semibold mb-3">{textProp(element, 'title', 'Panel')}</div>
      <div className="text-[13px] leading-5" style={{ color: LABEL_SECONDARY }}>
        {textProp(element, 'body', 'Panel body')}
      </div>
    </button>
  );
}

type FreeformConnection = {
  id: string;
  source: { x: number; y: number };
  target: { x: number; y: number };
  label: string;
  kind: Action['kind'];
};

type UrlNode = {
  id: string;
  x: number;
  y: number;
  label: string;
};

function FreeformCanvas({
  document,
  selectedSceneId,
  selectedElementId,
  touchMode,
  zoom,
  onSceneSelect,
  onElementSelect,
  onSceneCanvasChange,
}: {
  document: PresentationDocument;
  selectedSceneId: string;
  selectedElementId: string | null;
  touchMode: CanvasTouchMode;
  zoom: number;
  onSceneSelect: (sceneId: string) => void;
  onElementSelect: (sceneId: string, elementId: string) => void;
  onSceneCanvasChange: (sceneId: string, position: { x: number; y: number }) => void;
}) {
  const dragRef = useRef<{
    sceneId: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const scenePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    document.scenes.forEach((scene, index) => {
      map.set(scene.id, sceneCanvasPosition(scene, index));
    });
    return map;
  }, [document.scenes]);

  function pointForElement(scene: Scene, element: ElementNode) {
    const position = scenePositions.get(scene.id) ?? sceneCanvasPosition(scene, 0);
    const x = position.x + 22 + (element.frame.x / 100) * (CANVAS_PAGE_WIDTH - 44);
    const y = position.y + 62 + (element.frame.y / 100) * (CANVAS_PAGE_HEIGHT - 88);
    return { x, y };
  }

  function pointForScene(sceneId: string) {
    const position = scenePositions.get(sceneId);
    if (!position) return null;
    return {
      x: position.x + CANVAS_PAGE_WIDTH / 2,
      y: position.y + 34,
    };
  }

  function pointForAnchor(elementId: string) {
    for (const scene of document.scenes) {
      const element = scene.elements.find((item) => item.id === elementId);
      if (element) return pointForElement(scene, element);
    }
    return null;
  }

  const { connections, urlNodes } = useMemo(() => {
    const nextConnections: FreeformConnection[] = [];
    const nextUrlNodes: UrlNode[] = [];

    document.scenes.forEach((scene) => {
      scene.elements.forEach((element) => {
        const action = element.action;
        if (!action || action.kind === 'none') return;

        const source = pointForElement(scene, element);
        let target: { x: number; y: number } | null = null;
        let label: string = action.kind;

        if (action.kind === 'scene') {
          target = pointForScene(action.target);
          label = action.target;
        } else if (action.kind === 'anchor') {
          target = pointForAnchor(action.target);
          label = action.target;
        } else if (action.kind === 'url') {
          const node: UrlNode = {
            id: `${scene.id}-${element.id}-url`,
            x: source.x + 100,
            y: Math.max(30, source.y - 34),
            label: 'URL',
          };
          nextUrlNodes.push(node);
          target = { x: node.x + 34, y: node.y + 15 };
          label = 'url';
        }

        if (!target) return;
        nextConnections.push({
          id: `${scene.id}-${element.id}-${action.kind}`,
          source,
          target,
          label,
          kind: action.kind,
        });
      });
    });

    return { connections: nextConnections, urlNodes: nextUrlNodes };
  }, [document.scenes, scenePositions]);

  const boardSize = useMemo(() => {
    const sceneExtents = document.scenes.map((scene) => {
      const position = scenePositions.get(scene.id) ?? sceneCanvasPosition(scene, 0);
      return {
        x: position.x + CANVAS_PAGE_WIDTH,
        y: position.y + CANVAS_PAGE_HEIGHT,
      };
    });
    const urlExtents = urlNodes.map((node) => ({ x: node.x + 88, y: node.y + 44 }));
    const extents = [...sceneExtents, ...urlExtents];
    return {
      width: Math.max(1040, ...extents.map((item) => item.x + 90)),
      height: Math.max(560, ...extents.map((item) => item.y + 90)),
    };
  }, [document.scenes, scenePositions, urlNodes]);

  function startSceneDrag(scene: Scene, event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('[data-freeform-element]')) return;
    if (touchMode !== 'move') return;
    const position = scenePositions.get(scene.id) ?? sceneCanvasPosition(scene, 0);
    dragRef.current = {
      sceneId: scene.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSceneSelect(scene.id);
  }

  function moveScene(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onSceneCanvasChange(drag.sceneId, {
      x: Math.max(20, drag.originX + (event.clientX - drag.startX) / zoom),
      y: Math.max(20, drag.originY + (event.clientY - drag.startY) / zoom),
    });
  }

  function endSceneDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function selectSceneWithKeyboard(sceneId: string, event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSceneSelect(sceneId);
    }
  }

  return (
    <div className={`freeform-wrap is-${touchMode}`} role="region" aria-label="Presentation canvas map">
      <div className="freeform-hint">
        {touchMode === 'pan' ? 'Pan mode: drag the canvas to move around.' : 'Move mode: drag page cards to reshape the flow.'}
      </div>
      <div className="freeform-scale" style={{ width: boardSize.width * zoom, height: boardSize.height * zoom }}>
        <div
          className="freeform-board"
          style={{
            width: boardSize.width,
            height: boardSize.height,
            transform: `scale(${zoom})`,
          }}
        >
          <svg className="freeform-connections" width={boardSize.width} height={boardSize.height} aria-hidden="true">
            <defs>
              <marker id="freeform-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,4 L0,8 Z" fill={COLORS.accent} opacity="0.86" />
              </marker>
            </defs>
            {connections.map((connection) => {
              const midX = (connection.source.x + connection.target.x) / 2;
              const d = `M ${connection.source.x} ${connection.source.y} C ${midX} ${connection.source.y}, ${midX} ${connection.target.y}, ${connection.target.x} ${connection.target.y}`;
              return (
                <g key={connection.id}>
                  <path d={d} className={`freeform-link freeform-link-${connection.kind}`} markerEnd="url(#freeform-arrow)" />
                  <text x={midX} y={(connection.source.y + connection.target.y) / 2 - 6} className="freeform-link-label">
                    {connection.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {urlNodes.map((node) => (
            <div key={node.id} className="freeform-url-node" style={{ left: node.x, top: node.y }}>
              <ExternalLink size={12} />
              {node.label}
            </div>
          ))}

          {document.scenes.map((scene, sceneIndex) => {
            const position = scenePositions.get(scene.id) ?? sceneCanvasPosition(scene, sceneIndex);
            const selectedScene = scene.id === selectedSceneId;
            return (
              <div
                key={scene.id}
                role="button"
                tabIndex={0}
                aria-label={`Canvas page ${sceneIndex + 1}: ${scene.title}`}
                aria-pressed={selectedScene}
                className={`freeform-page-node${selectedScene ? ' is-selected' : ''}`}
                style={{ left: position.x, top: position.y, width: CANVAS_PAGE_WIDTH, height: CANVAS_PAGE_HEIGHT }}
                onClick={() => onSceneSelect(scene.id)}
                onKeyDown={(event) => selectSceneWithKeyboard(scene.id, event)}
                onPointerDown={(event) => startSceneDrag(scene, event)}
                onPointerMove={moveScene}
                onPointerUp={endSceneDrag}
                onPointerCancel={endSceneDrag}
              >
                <div className="freeform-page-header">
                  <div>
                    <div className="freeform-page-kicker">{String(sceneIndex + 1).padStart(2, '0')} · {scene.layout}</div>
                    <div className="freeform-page-title">{scene.title}</div>
                  </div>
                  <div className="freeform-page-count">{scene.elements.length}</div>
                </div>
                <div className="freeform-page-surface">
                  {scene.elements.map((element) => {
                    const point = pointForElement(scene, element);
                    const selectedElement = element.id === selectedElementId;
                    const style = resolvedStyle(element);
                    return (
                      <button
                        key={element.id}
                        type="button"
                        data-freeform-element
                        aria-label={`${element.type}: ${elementDisplayName(element)}`}
                        aria-pressed={selectedElement}
                        className={`freeform-element-node${selectedElement ? ' is-selected' : ''}`}
                        style={{
                          left: Math.max(8, Math.min(CANVAS_PAGE_WIDTH - 114, point.x - position.x - 46)),
                          top: Math.max(48, Math.min(CANVAS_PAGE_HEIGHT - 42, point.y - position.y - 15)),
                          borderColor: selectedElement ? style.accent : 'rgba(255,255,255,0.11)',
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onElementSelect(scene.id, element.id);
                        }}
                      >
                        <span className="freeform-element-type" style={{ color: style.accent }}>{element.type}</span>
                        <span>{elementDisplayName(element)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function handlePosition(h: ResizeHandle): React.CSSProperties {
  const s: React.CSSProperties = { position: 'absolute' };
  if (h.includes('n')) s.top = -6;
  if (h.includes('s')) s.bottom = -6;
  if (h.includes('w')) s.left = -6;
  if (h.includes('e')) s.right = -6;
  if (h === 'n' || h === 's') s.left = 'calc(50% - 6px)';
  if (h === 'e' || h === 'w') s.top = 'calc(50% - 6px)';
  return s;
}

function handleCursor(h: ResizeHandle): string {
  if (h === 'n' || h === 's') return 'ns-resize';
  if (h === 'e' || h === 'w') return 'ew-resize';
  if (h === 'nw' || h === 'se') return 'nwse-resize';
  return 'nesw-resize';
}

const roundPct = (v: number) => Math.round(v * 10) / 10;

// Direct-manipulation overlay over the selected element: drag the body to move,
// drag a handle to resize. Pixel deltas are converted to frame % against the
// live stage rect. Deliberately layered ON TOP of the element so it never
// touches the 11 per-type element renders.
function SelectionOverlay({
  element,
  getStageRect,
  onFrameChange,
  onHistoryBegin,
  onHistoryEnd,
}: {
  element: ElementNode;
  getStageRect: () => DOMRect | null;
  onFrameChange: (frame: ElementNode['frame']) => void;
  onHistoryBegin: () => void;
  onHistoryEnd: () => void;
}) {
  const drag = useRef<{
    mode: 'move' | ResizeHandle;
    startX: number;
    startY: number;
    frame: ElementNode['frame'];
    rect: DOMRect;
    committed: boolean;
  } | null>(null);
  const MIN = 5;

  function begin(mode: 'move' | ResizeHandle, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = getStageRect();
    if (!rect) return;
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      frame: { ...element.frame },
      rect,
      committed: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    // First actual movement opens a single undo transaction for the gesture.
    if (!d.committed) {
      d.committed = true;
      onHistoryBegin();
    }
    const dx = ((e.clientX - d.startX) / d.rect.width) * 100;
    const dy = ((e.clientY - d.startY) / d.rect.height) * 100;
    let { x, y, width, height } = d.frame;
    if (d.mode === 'move') {
      x = d.frame.x + dx;
      y = d.frame.y + dy;
    } else {
      if (d.mode.includes('e')) width = d.frame.width + dx;
      if (d.mode.includes('s')) height = d.frame.height + dy;
      if (d.mode.includes('w')) {
        width = d.frame.width - dx;
        x = d.frame.x + dx;
      }
      if (d.mode.includes('n')) {
        height = d.frame.height - dy;
        y = d.frame.y + dy;
      }
      if (width < MIN) {
        if (d.mode.includes('w')) x = d.frame.x + (d.frame.width - MIN);
        width = MIN;
      }
      if (height < MIN) {
        if (d.mode.includes('n')) y = d.frame.y + (d.frame.height - MIN);
        height = MIN;
      }
    }
    x = Math.max(0, Math.min(100 - MIN, x));
    y = Math.max(0, Math.min(100 - MIN, y));
    width = Math.max(MIN, Math.min(100 - x, width));
    height = Math.max(MIN, Math.min(100 - y, height));
    onFrameChange({ x: roundPct(x), y: roundPct(y), width: roundPct(width), height: roundPct(height) });
  }

  function end(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.committed) onHistoryEnd();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  return (
    <div
      className="absolute"
      style={{
        left: `${element.frame.x}%`,
        top: `${element.frame.y}%`,
        width: `${element.frame.width}%`,
        height: `${element.frame.height}%`,
        boxShadow: `0 0 0 1.5px ${COLORS.accent}`,
        borderRadius: 6,
        cursor: 'move',
        zIndex: 60,
        touchAction: 'none',
      }}
      onPointerDown={(e) => begin('move', e)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {RESIZE_HANDLES.map((h) => (
        <div
          key={h}
          onPointerDown={(e) => begin(h, e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{
            ...handlePosition(h),
            width: 12,
            height: 12,
            background: '#fff',
            boxShadow: `0 0 0 1.5px ${COLORS.accent}`,
            borderRadius: 3,
            cursor: handleCursor(h),
            touchAction: 'none',
          }}
        />
      ))}
    </div>
  );
}

export default function Dashboard({ isOffline, onUnauthorized }: Props) {
  const [document, setDocument] = useState<PresentationDocument>(() => loadStoredDocument());
  const [selectedSceneId, setSelectedSceneId] = useState(() => document.scenes[0]?.id ?? '');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(document.scenes[0]?.elements[0]?.id ?? null);
  const [mode, setMode] = useState<Mode>('edit');
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('stage');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [canvasTouchMode, setCanvasTouchMode] = useState<CanvasTouchMode>(() => (prefersTouchCanvasPan() ? 'pan' : 'move'));
  const [canvasZoom, setCanvasZoom] = useState(() => (prefersTouchCanvasPan() ? 0.78 : 1));
  const [editLevel, setEditLevel] = useState<EditLevel>(() => loadEditLevel());
  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageSwipeRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const skipNextStageClickRef = useRef(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [decks, setDecks] = useState<
    Array<{ id: string; title: string; updatedAt: number }>
  >([]);
  const [decksOpen, setDecksOpen] = useState(false);
  const serverSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const decksRef = useRef<HTMLDivElement | null>(null);
  // Undo/redo history: snapshots of the document before each edit. Capped so a
  // long session can't grow memory unbounded. suspendHistoryRef groups a
  // continuous gesture (a drag) into a single undo step (snapshot once at the
  // start, skip per-frame snapshots) — research: one interaction = one undo.
  const pastRef = useRef<PresentationDocument[]>([]);
  const futureRef = useRef<PresentationDocument[]>([]);
  const suspendHistoryRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    saveStoredDocument(document);
  }, [document]);

  // Cross-device persistence: on mount, adopt the owner's most-recent saved
  // presentation from the server (the source of truth across devices), or
  // create one from the current local document if none exists yet. Offline or
  // unauthenticated, we keep working from the localStorage copy loaded above.
  useEffect(() => {
    if (isOffline) return;
    let cancelled = false;
    void (async () => {
      try {
        const { presentations } = await api.presentations.list();
        if (cancelled) return;
        setDecks(presentations);
        if (presentations.length > 0) {
          const loaded = await api.presentations.get(presentations[0].id);
          if (cancelled) return;
          const doc = loaded.document as PresentationDocument;
          if (doc?.version === 1 && Array.isArray(doc.scenes)) {
            setDocument(doc);
            setSelectedSceneId(doc.scenes[0]?.id ?? '');
            setSelectedElementId(doc.scenes[0]?.elements[0]?.id ?? null);
          }
          setCurrentId(loaded.id);
        } else {
          const created = await api.presentations.create(document);
          if (cancelled) return;
          setCurrentId(created.id);
          setDecks([
            { id: created.id, title: created.title, updatedAt: created.updatedAt },
          ]);
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) onUnauthorized();
        // else: keep working locally; saves resume when the server is reachable.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only — intentionally does not re-run on document changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save to the server on every document change (the instant
  // localStorage mirror above keeps offline edits safe meanwhile).
  useEffect(() => {
    if (isOffline || !currentId) return;
    setSaveStatus('saving');
    if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);
    serverSaveTimer.current = setTimeout(() => {
      void api.presentations
        .save(currentId, document)
        .then(() => setSaveStatus('saved'))
        .catch((err) => {
          if (err instanceof UnauthorizedError) onUnauthorized();
          else setSaveStatus('idle');
        });
    }, 800);
    return () => {
      if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);
    };
  }, [document, currentId, isOffline, onUnauthorized]);

  useEffect(() => {
    window.localStorage.setItem(EDIT_LEVEL_STORAGE_KEY, editLevel);
  }, [editLevel]);

  const selectedScene = useMemo(
    () => document.scenes.find((scene) => scene.id === selectedSceneId) ?? document.scenes[0],
    [document.scenes, selectedSceneId],
  );
  const selectedSceneIndex = Math.max(0, document.scenes.findIndex((scene) => scene.id === selectedScene?.id));
  const selectedElement = selectedScene?.elements.find((element) => element.id === selectedElementId) ?? null;
  const sourcePreviewHref = useMemo(() => publicAssetHref(document.source.previewPath), [document.source.previewPath]);
  const visibleElementDefinitions = useMemo(
    () => (editLevel === 'simple' ? elementDefinitions.filter((definition) => definition.complexity === 'simple') : elementDefinitions),
    [editLevel],
  );

  function pushHistory() {
    pastRef.current.push(document);
    if (pastRef.current.length > 80) pastRef.current.shift();
    futureRef.current = [];
  }

  function updateDocument(mutator: (draft: PresentationDocument) => void) {
    // During a grouped gesture (a drag) the snapshot was already taken at the
    // start, so per-frame edits don't each become an undo step.
    if (!suspendHistoryRef.current) pushHistory();
    setDocument((current) => {
      const draft = cloneValue(current);
      mutator(draft);
      return draft;
    });
    setValidation({ status: 'idle' });
  }

  // Wrap a continuous interaction so it collapses to one undo step.
  function beginHistoryGroup() {
    pushHistory();
    suspendHistoryRef.current = true;
  }

  function endHistoryGroup() {
    suspendHistoryRef.current = false;
  }

  // ---- Decks (multiple saved presentations) ------------------------

  async function refreshDecks() {
    try {
      const { presentations } = await api.presentations.list();
      setDecks(presentations);
    } catch {
      /* keep the current list */
    }
  }

  function loadDocumentInto(doc: PresentationDocument, id: string) {
    pastRef.current = [];
    futureRef.current = [];
    setDocument(doc);
    setCurrentId(id);
    setSelectedSceneId(doc.scenes[0]?.id ?? '');
    setSelectedElementId(doc.scenes[0]?.elements[0]?.id ?? null);
    setValidation({ status: 'idle' });
  }

  async function newDeck() {
    setDecksOpen(false);
    if (isOffline) return;
    const doc = blankDocument('Untitled presentation', String(Date.now()));
    try {
      const created = await api.presentations.create(doc);
      loadDocumentInto(doc, created.id);
      void refreshDecks();
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized();
    }
  }

  async function switchDeck(id: string) {
    setDecksOpen(false);
    if (id === currentId || isOffline) return;
    try {
      const loaded = await api.presentations.get(id);
      const doc = loaded.document as PresentationDocument;
      if (doc?.version === 1 && Array.isArray(doc.scenes)) {
        loadDocumentInto(doc, loaded.id);
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized();
    }
  }

  async function deleteDeck(id: string) {
    if (isOffline) return;
    try {
      await api.presentations.remove(id);
      const remaining = decks.filter((d) => d.id !== id);
      setDecks(remaining);
      if (id === currentId) {
        if (remaining.length > 0) await switchDeck(remaining[0].id);
        else await newDeck();
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized();
    }
  }

  // Close the decks menu when clicking outside it.
  useEffect(() => {
    if (!decksOpen) return;
    function onDown(e: MouseEvent) {
      if (decksRef.current && !decksRef.current.contains(e.target as Node)) {
        setDecksOpen(false);
      }
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [decksOpen]);

  function undo() {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop() as PresentationDocument;
    futureRef.current.push(document);
    setDocument(prev);
    setValidation({ status: 'idle' });
  }

  function redo() {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop() as PresentationDocument;
    pastRef.current.push(document);
    setDocument(next);
    setValidation({ status: 'idle' });
  }

  function nudgeSelected(dx: number, dy: number) {
    if (!selectedElement) return;
    patchElement({
      frame: {
        ...selectedElement.frame,
        x: Math.max(0, Math.min(95, Math.round((selectedElement.frame.x + dx) * 10) / 10)),
        y: Math.max(0, Math.min(95, Math.round((selectedElement.frame.y + dy) * 10) / 10)),
      },
    });
  }

  // Keyboard: ⌘Z / ⌘⇧Z undo-redo, ⌘D duplicate, Delete/Backspace remove,
  // arrows nudge the selected element. Ignored while typing in a field.
  useEffect(() => {
    function isTextEntry(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      );
    }
    function onKey(e: KeyboardEvent) {
      if (isTextEntry(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mode !== 'edit') return;
      if (mod && k === 'd') {
        if (!selectedElement) return;
        e.preventDefault();
        duplicateElement();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement) {
        e.preventDefault();
        deleteElement();
        return;
      }
      if (selectedElement && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        if (e.key === 'ArrowLeft') nudgeSelected(-step, 0);
        else if (e.key === 'ArrowRight') nudgeSelected(step, 0);
        else if (e.key === 'ArrowUp') nudgeSelected(0, -step);
        else if (e.key === 'ArrowDown') nudgeSelected(0, step);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // The handlers close over the state in the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedElement, document]);

  async function onLogout() {
    if (isOffline) return;
    try {
      await api.logout();
    } catch {
      // ignore
    }
    onUnauthorized();
  }

  function addScene() {
    updateDocument((draft) => {
      const id = slug(`scene-${draft.scenes.length + 1}`) || `scene-${draft.scenes.length + 1}`;
      draft.scenes.push({
        id,
        title: `Scene ${draft.scenes.length + 1}`,
        layout: 'viewport',
        transition: { kind: 'fade', durationMs: 360 },
        canvas: defaultCanvasPosition(draft.scenes.length),
        elements: [
          {
            ...newElement('headline', 0),
            id: `${id}-headline`,
            props: {
              kicker: 'Scene',
              title: `Scene ${draft.scenes.length + 1}`,
              subtitle: 'Shape this moment with premade elements.',
            },
          },
        ],
      });
      setSelectedSceneId(id);
      setSelectedElementId(`${id}-headline`);
      setMobilePanel(null);
    });
  }

  function addElement(type: ElementType) {
    if (!selectedScene) return;
    updateDocument((draft) => {
      const scene = draft.scenes.find((item) => item.id === selectedScene.id);
      if (!scene) return;
      const element = newElement(type, scene.elements.length);
      scene.elements.push(element);
      setSelectedElementId(element.id);
      setMobilePanel(null);
      setSurfaceMode('stage');
    });
  }

  function patchElement(patch: Partial<ElementNode>) {
    if (!selectedScene || !selectedElement) return;
    updateDocument((draft) => {
      const scene = draft.scenes.find((item) => item.id === selectedScene.id);
      const element = scene?.elements.find((item) => item.id === selectedElement.id);
      if (!element) return;
      Object.assign(element, patch);
    });
  }

  function patchElementProp(key: string, value: string) {
    if (!selectedElement) return;
    patchElement({
      props: {
        ...selectedElement.props,
        [key]: key === 'data' ? parseChartData(value) : value,
      },
    });
  }

  function patchFrame(key: keyof ElementNode['frame'], value: number) {
    if (!selectedElement) return;
    patchElement({
      frame: {
        ...selectedElement.frame,
        [key]: value,
      },
    });
  }

  function patchElementStyle(patch: ElementStyle) {
    if (!selectedElement) return;
    patchElement({
      style: {
        ...resolvedStyle(selectedElement),
        ...patch,
      },
    });
  }

  function patchScene(patch: Partial<Scene>) {
    if (!selectedScene) return;
    updateDocument((draft) => {
      const scene = draft.scenes.find((item) => item.id === selectedScene.id);
      if (!scene) return;
      Object.assign(scene, patch);
    });
  }

  function patchSceneTransition(patch: Partial<Scene['transition']>) {
    if (!selectedScene) return;
    patchScene({
      transition: {
        ...selectedScene.transition,
        ...patch,
      },
    });
  }

  function patchSceneCanvas(sceneId: string, position: { x: number; y: number }) {
    updateDocument((draft) => {
      const scene = draft.scenes.find((item) => item.id === sceneId);
      if (!scene) return;
      scene.canvas = {
        x: Math.round(position.x),
        y: Math.round(position.y),
      };
    });
  }

  function duplicateElement() {
    if (!selectedScene || !selectedElement) return;
    updateDocument((draft) => {
      const scene = draft.scenes.find((item) => item.id === selectedScene.id);
      if (!scene) return;
      const copy = cloneValue(selectedElement);
      copy.id = `${copy.id}-copy-${scene.elements.length + 1}`;
      copy.frame.x = Math.min(88, copy.frame.x + 3);
      copy.frame.y = Math.min(88, copy.frame.y + 3);
      scene.elements.push(copy);
      setSelectedElementId(copy.id);
    });
  }

  function deleteElement() {
    if (!selectedScene || !selectedElement) return;
    updateDocument((draft) => {
      const scene = draft.scenes.find((item) => item.id === selectedScene.id);
      if (!scene) return;
      scene.elements = scene.elements.filter((item) => item.id !== selectedElement.id);
      setSelectedElementId(scene.elements[0]?.id ?? null);
    });
  }

  function onAction(action?: Action) {
    if (!action || action.kind === 'none') return;
    if (action.kind === 'scene') {
      const scene = document.scenes.find((item) => item.id === action.target);
      if (scene) {
        setSelectedSceneId(scene.id);
        setSelectedElementId(scene.elements[0]?.id ?? null);
      }
    } else if (action.kind === 'anchor') {
      const scene = document.scenes.find((item) => item.elements.some((element) => element.id === action.target));
      if (scene) {
        setSelectedSceneId(scene.id);
        setSelectedElementId(action.target);
      }
    } else {
      const href = safeExternalHref(action.href);
      if (!href) {
        setValidation({
          status: 'checked',
          valid: false,
          diagnostics: [
            {
              level: 'error',
              path: '$.action.href',
              message: 'URL action must use http, https, or mailto.',
            },
          ],
          stats: documentStats(document),
        });
        return;
      }
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = href;
    link.download = `${slug(document.title) || 'citrine'}.json`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  async function importJson(file: File) {
    const text = await file.text();
    const next = JSON.parse(text) as PresentationDocument;
    setDocument(next);
    setSelectedSceneId(next.scenes[0]?.id ?? '');
    setSelectedElementId(next.scenes[0]?.elements[0]?.id ?? null);
    setValidation({ status: 'idle' });
  }

  async function validateDocument() {
    if (isOffline) {
      setValidation({
        status: 'checked',
        valid: false,
        diagnostics: [
          {
            level: 'warning',
            path: '$',
            message: 'Validation needs a connection. Your local document is still saved on this device.',
          },
        ],
        stats: documentStats(document),
      });
      return;
    }
    setValidation({ status: 'checking' });
    try {
      const result = await api.presentation.validate(document);
      setValidation({ status: 'checked', ...result });
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized();
      else {
        setValidation({
          status: 'checked',
          valid: false,
          diagnostics: [{ level: 'error', path: '$', message: (err as Error).message || 'Validation failed' }],
          stats: { scenes: document.scenes.length, elements: 0, actions: 0 },
        });
      }
    }
  }

  function resetSeed() {
    clearStoredDocument();
    setDocument(cloneValue(seedDocument));
    setSelectedSceneId(seedDocument.scenes[0].id);
    setSelectedElementId(seedDocument.scenes[0].elements[0].id);
    setValidation({ status: 'idle' });
  }

  function openImportedSource() {
    if (!sourcePreviewHref) return;
    if (isOffline) {
      setValidation({
        status: 'checked',
        valid: false,
        diagnostics: [
          {
            level: 'warning',
            path: '$.source',
            message: 'Imported source preview is online-only. Local editing remains available offline.',
          },
        ],
        stats: documentStats(document),
      });
      return;
    }
    window.open(sourcePreviewHref, '_blank', 'noopener,noreferrer');
  }

  function selectScene(scene: Scene) {
    setSelectedSceneId(scene.id);
    setSelectedElementId(scene.elements[0]?.id ?? null);
    setMobilePanel(null);
  }

  function goToSceneOffset(offset: number) {
    if (!document.scenes.length) return;
    const nextIndex = Math.min(document.scenes.length - 1, Math.max(0, selectedSceneIndex + offset));
    const nextScene = document.scenes[nextIndex];
    if (!nextScene || nextScene.id === selectedScene?.id) return;
    setSelectedSceneId(nextScene.id);
    setSelectedElementId(nextScene.elements[0]?.id ?? null);
  }

  function onStagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (mode !== 'preview') return;
    stageSwipeRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
    };
  }

  function onStagePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = stageSwipeRef.current;
    stageSwipeRef.current = null;
    if (!start || mode !== 'preview') return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const elapsed = Date.now() - start.time;
    if (elapsed > 900 || Math.abs(dx) < 54 || Math.abs(dy) > 48) return;
    skipNextStageClickRef.current = true;
    goToSceneOffset(dx < 0 ? 1 : -1);
  }

  function onStageClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!skipNextStageClickRef.current) return;
    skipNextStageClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function nudgeCanvasZoom(direction: 1 | -1) {
    setCanvasZoom((current) => clampCanvasZoom(current + direction * CANVAS_ZOOM_STEP));
  }

  function fitCanvasZoom() {
    setCanvasZoom(() => {
      if (typeof window === 'undefined') return 1;
      if (window.innerWidth < 700) return 0.62;
      if (window.innerWidth < 1100) return 0.78;
      return 0.92;
    });
  }

  return (
    <div className="citrine-app min-h-screen" style={{ background: COLORS.bg, color: COLORS.ink }}>
      <header
        className="app-header min-h-16 px-4 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30"
        style={{ background: 'rgba(10,10,13,0.92)', borderBottom: `1px solid ${RING_STRONG}`, backdropFilter: 'blur(18px)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <LayoutTemplate size={20} color={COLORS.accent} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold truncate">Citrine</h1>
              {saveStatus !== 'idle' && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{
                    color: saveStatus === 'saved' ? COLORS.accent : LABEL_TERTIARY,
                    background: 'rgba(255,255,255,0.06)',
                  }}
                >
                  {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
                </span>
              )}
            </div>
            <p className="text-[12px] truncate" style={{ color: LABEL_TERTIARY }}>
              {document.title} · {document.source.status === 'imported' ? 'Claude Design source imported' : 'MCP import pending'}
            </p>
          </div>

          <div className="relative" ref={decksRef}>
            <button
              type="button"
              className="toolbar-button"
              onClick={() => {
                setDecksOpen((o) => !o);
                void refreshDecks();
              }}
              disabled={isOffline}
              aria-haspopup="menu"
              aria-expanded={decksOpen}
            >
              <LayoutTemplate size={14} /> Decks
            </button>
            {decksOpen && (
              <div
                className="absolute left-0 mt-2 z-50 w-64 rounded-xl overflow-hidden"
                style={{
                  background: 'rgba(18,22,32,0.98)',
                  boxShadow: `0 16px 40px rgba(0,1,8,0.6), inset 0 0 0 1px ${RING_STRONG}`,
                }}
                role="menu"
              >
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-[13px] font-medium flex items-center gap-2 hover:bg-white/5"
                  style={{ color: COLORS.accent }}
                  onClick={() => void newDeck()}
                >
                  <Plus size={14} /> New presentation
                </button>
                <div style={{ height: 1, background: RING_SUBTLE }} />
                <div className="max-h-64 overflow-auto py-1">
                  {decks.length === 0 && (
                    <div className="px-3 py-2 text-[12px]" style={{ color: LABEL_TERTIARY }}>
                      No saved presentations yet.
                    </div>
                  )}
                  {decks.map((d) => (
                    <div key={d.id} className="flex items-center">
                      <button
                        type="button"
                        className="flex-1 text-left px-3 py-2 text-[13px] truncate hover:bg-white/5"
                        style={{ color: d.id === currentId ? COLORS.accent : LABEL_SECONDARY }}
                        onClick={() => void switchDeck(d.id)}
                      >
                        {d.title || 'Untitled'}
                      </button>
                      <button
                        type="button"
                        className="px-2 py-2 hover:bg-white/5"
                        style={{ color: LABEL_TERTIARY }}
                        aria-label={`Delete ${d.title || 'Untitled'}`}
                        onClick={() => void deleteDeck(d.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="app-toolbar desktop-toolbar">
          <div className="segmented-control" role="group" aria-label="Editing level">
            <button
              type="button"
              className={editLevel === 'simple' ? 'is-active' : ''}
              onClick={() => setEditLevel('simple')}
            >
              <SlidersHorizontal size={14} />
              Simple
            </button>
            <button
              type="button"
              className={editLevel === 'advanced' ? 'is-active' : ''}
              onClick={() => setEditLevel('advanced')}
            >
              <Sparkles size={14} />
              Advanced
            </button>
          </div>
          {sourcePreviewHref && (
            <button type="button" className="toolbar-button" onClick={openImportedSource} disabled={isOffline}>
              <ExternalLink size={15} />
              Source
            </button>
          )}
          <button type="button" className="toolbar-button" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
            {mode === 'edit' ? <Eye size={15} /> : <MousePointer2 size={15} />}
            {mode === 'edit' ? 'Preview' : 'Edit'}
          </button>
          <button type="button" className="toolbar-button" onClick={validateDocument} disabled={isOffline}>
            <FileJson size={15} />
            Validate
          </button>
          <button type="button" className="toolbar-button" onClick={exportJson}>
            <Download size={15} />
            Export
          </button>
          <button type="button" className="toolbar-button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
            Import
          </button>
          <button type="button" className="toolbar-button" onClick={onLogout} disabled={isOffline}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importJson(file);
          event.currentTarget.value = '';
        }}
      />

      <main className={`editor-shell min-h-[calc(100vh-64px)]${mobilePanel ? ' has-mobile-panel' : ''}`}>
        <aside
          className={`editor-rail editor-rail-left mobile-panel border-r max-[980px]:border-r-0${mobilePanel === 'scenes' || mobilePanel === 'elements' ? ' is-open' : ''}${mobilePanel === 'elements' ? ' show-elements' : ' show-scenes'}`}
          style={{ borderColor: RING_STRONG }}
        >
          <div className="citrine-scenes-block">
            {document.source.status === 'imported' && (
              <div
                className="mb-5 rounded-lg p-3"
                style={{ background: COLORS.card, boxShadow: `inset 0 0 0 1px ${RING_STRONG}` }}
              >
                <div className="text-[11px] uppercase tracking-[0.16em] mb-1" style={{ color: COLORS.accent }}>
                  Imported source
                </div>
                <div className="text-[13px] font-semibold">{document.source.name}</div>
                <div className="text-[12px] mt-1" style={{ color: LABEL_TERTIARY }}>
                  {document.source.templateFamilyCount ?? 15} template families · SHA {document.source.htmlSha256?.slice(0, 8)}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold">Scenes</h2>
              <button type="button" className="icon-button" onClick={addScene} aria-label="Add scene">
                <Plus size={15} />
              </button>
            </div>
            <div className="scene-list space-y-2 mb-6">
              {document.scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => selectScene(scene)}
                  className="scene-list-button w-full rounded-lg p-3 text-left"
                  style={{
                    background: scene.id === selectedScene?.id ? COLORS.card : COLORS.surface,
                    boxShadow: `inset 0 0 0 1px ${scene.id === selectedScene?.id ? COLORS.accent : RING_STRONG}`,
                  }}
                >
                  <div className="text-[12px] mb-1" style={{ color: LABEL_TERTIARY }}>
                    {String(index + 1).padStart(2, '0')}{editLevel === 'advanced' ? ` · ${scene.transition.kind}` : ''}
                  </div>
                  <div className="text-[14px] font-medium">{scene.title}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="citrine-elements-block">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold">Premade Elements</h2>
            </div>
            <div className="element-palette-grid space-y-2">
              {visibleElementDefinitions.map((definition) => (
                <button
                  key={definition.type}
                  type="button"
                  onClick={() => addElement(definition.type)}
                  className="element-palette-button"
                  style={{ background: COLORS.surface, boxShadow: `inset 0 0 0 1px ${RING_STRONG}` }}
                >
                  <div className="text-[13px] font-medium">{definition.label}</div>
                  <div className="text-[12px] leading-4 mt-1" style={{ color: LABEL_TERTIARY }}>
                    {definition.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="editor-canvas min-w-0">
          <div className="flex items-center justify-between mb-4 gap-3 max-[640px]:items-start max-[640px]:flex-col">
            <div>
              <div className="text-[12px]" style={{ color: LABEL_TERTIARY }}>
                {surfaceMode === 'canvas' ? `Canvas · ${canvasTouchMode}` : mode === 'preview' ? 'Preview' : 'Edit'} · {editLevel}
              </div>
              <h2 className="text-[20px] font-semibold">{selectedScene?.title}</h2>
            </div>
            <div className="editor-local-toolbar flex flex-wrap items-center gap-2">
              <div className="segmented-control" role="group" aria-label="Editor surface">
                <button
                  type="button"
                  className={surfaceMode === 'stage' ? 'is-active' : ''}
                  onClick={() => setSurfaceMode('stage')}
                >
                  <LayoutTemplate size={14} />
                  Stage
                </button>
                <button
                  type="button"
                  className={surfaceMode === 'canvas' ? 'is-active' : ''}
                  onClick={() => setSurfaceMode('canvas')}
                >
                  <LinkIcon size={14} />
                  Canvas
                </button>
              </div>
              {surfaceMode === 'canvas' && (
                <>
                  <div className="segmented-control" role="group" aria-label="Canvas touch mode">
                    <button
                      type="button"
                      className={canvasTouchMode === 'pan' ? 'is-active' : ''}
                      onClick={() => setCanvasTouchMode('pan')}
                    >
                      <Hand size={14} />
                      Pan
                    </button>
                    <button
                      type="button"
                      className={canvasTouchMode === 'move' ? 'is-active' : ''}
                      onClick={() => setCanvasTouchMode('move')}
                    >
                      <MousePointer2 size={14} />
                      Move
                    </button>
                  </div>
                  <div className="canvas-zoom-control" role="group" aria-label="Canvas zoom">
                    <button type="button" className="icon-button" onClick={() => nudgeCanvasZoom(-1)} aria-label="Zoom out">
                      <ZoomOut size={14} />
                    </button>
                    <span>{Math.round(canvasZoom * 100)}%</span>
                    <button type="button" className="icon-button" onClick={() => nudgeCanvasZoom(1)} aria-label="Zoom in">
                      <ZoomIn size={14} />
                    </button>
                    <button type="button" className="icon-button" onClick={fitCanvasZoom} aria-label="Fit canvas">
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </>
              )}
              {mode === 'edit' && (
                <>
                  <button type="button" className="toolbar-button" onClick={duplicateElement} disabled={!selectedElement}>
                    <Copy size={14} />
                    Duplicate
                  </button>
                  <button type="button" className="toolbar-button" onClick={deleteElement} disabled={!selectedElement}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {surfaceMode === 'stage' ? (
            <>
              <div className="stage-wrap">
                <div
                  ref={stageRef}
                  className={`stage stage-${selectedScene?.transition.kind ?? 'fade'}`}
                  style={{ background: `radial-gradient(circle at 80% 20%, rgba(242,85,47,0.18), transparent 34%), ${document.theme.background}` }}
                  onPointerDown={onStagePointerDown}
                  onPointerUp={onStagePointerUp}
                  onClickCapture={onStageClickCapture}
                >
                  {selectedScene?.elements.map((element) => (
                    <ElementView
                      key={element.id}
                      element={element}
                      selected={element.id === selectedElement?.id}
                      mode={mode}
                      onSelect={() => setSelectedElementId(element.id)}
                      onAction={onAction}
                    />
                  ))}
                  {mode === 'edit' && selectedElement && (
                    <SelectionOverlay
                      element={selectedElement}
                      getStageRect={() => stageRef.current?.getBoundingClientRect() ?? null}
                      onFrameChange={(frame) => patchElement({ frame })}
                      onHistoryBegin={beginHistoryGroup}
                      onHistoryEnd={endHistoryGroup}
                    />
                  )}
                </div>
              </div>

              {mode === 'preview' && (
                <div className="preview-swipe-controls" aria-label="Preview navigation">
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => goToSceneOffset(-1)}
                    disabled={selectedSceneIndex <= 0}
                  >
                    <ChevronLeft size={15} />
                    Previous
                  </button>
                  <span>{selectedSceneIndex + 1} / {document.scenes.length}</span>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => goToSceneOffset(1)}
                    disabled={selectedSceneIndex >= document.scenes.length - 1}
                  >
                    Next
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}

              <div
                className="mt-4 rounded-lg p-4"
                style={{ background: COLORS.card, boxShadow: `inset 0 0 0 1px ${RING_STRONG}` }}
              >
                <div className="flex items-start gap-3">
                  <LinkIcon size={16} color={COLORS.accent} className="mt-0.5" />
                  <div>
                    <div className="text-[13px] font-semibold mb-1">Web-native navigation</div>
                    <p className="text-[13px] leading-5" style={{ color: LABEL_SECONDARY }}>
                      Scene elements can link to scenes, anchors, or URLs. In preview mode, the same elements become the presentation navigation layer.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <FreeformCanvas
              document={document}
              selectedSceneId={selectedScene?.id ?? ''}
              selectedElementId={selectedElement?.id ?? null}
              touchMode={canvasTouchMode}
              zoom={canvasZoom}
              onSceneSelect={(sceneId) => {
                const scene = document.scenes.find((item) => item.id === sceneId);
                setSelectedSceneId(sceneId);
                setSelectedElementId(scene?.elements[0]?.id ?? null);
              }}
              onElementSelect={(sceneId, elementId) => {
                setSelectedSceneId(sceneId);
                setSelectedElementId(elementId);
              }}
              onSceneCanvasChange={patchSceneCanvas}
            />
          )}
        </section>

        <aside
          className={`editor-rail editor-rail-right mobile-panel border-l max-[980px]:border-l-0${mobilePanel === 'inspector' ? ' is-open' : ''}`}
          style={{ borderColor: RING_STRONG }}
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <PanelRight size={16} color={COLORS.accent} />
              <h2 className="text-[13px] font-semibold">Inspector</h2>
            </div>
            <div className="text-[11px] capitalize" style={{ color: LABEL_TERTIARY }}>
              {editLevel}
            </div>
          </div>

          {selectedElement ? (
            <div className="space-y-4">
              {editLevel === 'advanced' && selectedScene && (
                <InspectorSection title="Scene">
                  <InspectorField label="Scene title" value={selectedScene.title} onChange={(value) => patchScene({ title: value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <InspectorSelect
                      label="layout"
                      value={selectedScene.layout}
                      options={LAYOUT_OPTIONS}
                      onChange={(value) => patchScene({ layout: value as SceneLayout })}
                    />
                    <InspectorSelect
                      label="transition"
                      value={selectedScene.transition.kind}
                      options={TRANSITION_OPTIONS}
                      onChange={(value) => patchSceneTransition({ kind: value as TransitionKind })}
                    />
                  </div>
                  <InspectorNumber
                    label="duration"
                    value={selectedScene.transition.durationMs}
                    min={0}
                    max={1800}
                    onChange={(value) => patchSceneTransition({ durationMs: value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <InspectorNumber
                      label="canvas x"
                      value={sceneCanvasPosition(selectedScene, document.scenes.findIndex((scene) => scene.id === selectedScene.id)).x}
                      max={5000}
                      onChange={(value) => patchSceneCanvas(selectedScene.id, { ...sceneCanvasPosition(selectedScene, document.scenes.findIndex((scene) => scene.id === selectedScene.id)), x: value })}
                    />
                    <InspectorNumber
                      label="canvas y"
                      value={sceneCanvasPosition(selectedScene, document.scenes.findIndex((scene) => scene.id === selectedScene.id)).y}
                      max={5000}
                      onChange={(value) => patchSceneCanvas(selectedScene.id, { ...sceneCanvasPosition(selectedScene, document.scenes.findIndex((scene) => scene.id === selectedScene.id)), y: value })}
                    />
                  </div>
                </InspectorSection>
              )}

              <InspectorSection title="Content">
                {editLevel === 'advanced' && (
                  <InspectorField label="Element id" value={selectedElement.id} onChange={(value) => patchElement({ id: slug(value) || selectedElement.id })} />
                )}
                <PropsEditor element={selectedElement} editLevel={editLevel} onChange={patchElementProp} />
              </InspectorSection>

              {editLevel === 'advanced' && (
                <InspectorSection title="Layout">
                  <div className="grid grid-cols-2 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map((key) => (
                      <InspectorNumber key={key} label={key} value={selectedElement.frame[key]} onChange={(value) => patchFrame(key, value)} />
                    ))}
                  </div>
                </InspectorSection>
              )}

              {editLevel === 'advanced' && (
                <InspectorSection title="Design">
                  <div className="grid grid-cols-2 gap-2">
                    <InspectorSelect
                      label="tone"
                      value={resolvedStyle(selectedElement).tone}
                      options={['solid', 'glass', 'outline']}
                      onChange={(value) => patchElementStyle({ tone: value as ElementStyle['tone'] })}
                    />
                    <InspectorSelect
                      label="radius"
                      value={resolvedStyle(selectedElement).radius}
                      options={['sharp', 'soft', 'pill']}
                      onChange={(value) => patchElementStyle({ radius: value as ElementStyle['radius'] })}
                    />
                  </div>
                  <InspectorField
                    label="accent"
                    value={resolvedStyle(selectedElement).accent}
                    onChange={(value) => patchElementStyle({ accent: value })}
                  />
                </InspectorSection>
              )}

              <ActionEditor
                action={selectedElement.action ?? { kind: 'none' }}
                scenes={document.scenes}
                elements={selectedScene?.elements ?? []}
                onChange={(action) => patchElement({ action })}
              />
            </div>
          ) : (
            <div className="text-[13px]" style={{ color: LABEL_TERTIARY }}>
              Select an element to edit its content, frame, and navigation action.
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button type="button" className="wide-button" onClick={resetSeed}>
              <RotateCcw size={15} />
              Reset seed
            </button>
            {validation.status === 'checked' && (
              <div
                className="rounded-2xl p-3"
                style={{
                  background: validation.valid ? 'rgba(48,209,88,0.10)' : 'rgba(255,69,58,0.10)',
                  boxShadow: `inset 0 0 0 1px ${validation.valid ? 'rgba(48,209,88,0.25)' : 'rgba(255,69,58,0.25)'}`,
                }}
              >
                <div className="text-[13px] font-semibold mb-1">
                  {validation.valid ? 'Validation passed' : 'Validation needs work'}
                </div>
                <div className="text-[12px] mb-2" style={{ color: LABEL_SECONDARY }}>
                  {validation.stats.scenes} scenes · {validation.stats.elements} elements · {validation.stats.actions} actions
                </div>
                <div className="space-y-1">
                  {validation.diagnostics.slice(0, 4).map((diagnostic) => (
                    <div key={`${diagnostic.path}-${diagnostic.message}`} className="text-[12px]" style={{ color: LABEL_SECONDARY }}>
                      {diagnostic.level}: {diagnostic.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>

      {mobilePanel && (
        <button
          type="button"
          className="mobile-panel-backdrop"
          aria-label="Close panel"
          onClick={() => setMobilePanel(null)}
        />
      )}

      {mobilePanel === 'actions' && (
        <section className="mobile-actions-sheet" aria-label="Citrine actions">
          <div className="mobile-actions-grid">
            <div className="segmented-control" role="group" aria-label="Editing level">
              <button
                type="button"
                className={editLevel === 'simple' ? 'is-active' : ''}
                onClick={() => setEditLevel('simple')}
              >
                <SlidersHorizontal size={14} />
                Simple
              </button>
              <button
                type="button"
                className={editLevel === 'advanced' ? 'is-active' : ''}
                onClick={() => setEditLevel('advanced')}
              >
                <Sparkles size={14} />
                Advanced
              </button>
            </div>
            {sourcePreviewHref && (
              <button type="button" className="toolbar-button" onClick={openImportedSource} disabled={isOffline}>
                <ExternalLink size={15} />
                Source
              </button>
            )}
            <button type="button" className="toolbar-button" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
              {mode === 'edit' ? <Eye size={15} /> : <MousePointer2 size={15} />}
              {mode === 'edit' ? 'Preview' : 'Edit'}
            </button>
            <button type="button" className="toolbar-button" onClick={validateDocument} disabled={isOffline}>
              <FileJson size={15} />
              Validate
            </button>
            <button type="button" className="toolbar-button" onClick={exportJson}>
              <Download size={15} />
              Export
            </button>
            <button type="button" className="toolbar-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} />
              Import
            </button>
            <button type="button" className="toolbar-button" onClick={onLogout} disabled={isOffline}>
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </section>
      )}

      <nav className="mobile-bottom-nav" aria-label="Citrine touch panels">
        <button
          type="button"
          className={mobilePanel === 'scenes' ? 'is-active' : ''}
          onClick={() => setMobilePanel((panel) => (panel === 'scenes' ? null : 'scenes'))}
        >
          <LayoutTemplate size={18} />
          Scenes
        </button>
        <button
          type="button"
          className={mobilePanel === 'elements' ? 'is-active' : ''}
          onClick={() => setMobilePanel((panel) => (panel === 'elements' ? null : 'elements'))}
        >
          <Plus size={18} />
          Elements
        </button>
        <button
          type="button"
          className={mobilePanel === 'inspector' ? 'is-active' : ''}
          onClick={() => setMobilePanel((panel) => (panel === 'inspector' ? null : 'inspector'))}
        >
          <PanelRight size={18} />
          Inspector
        </button>
        <button
          type="button"
          className={mobilePanel === 'actions' ? 'is-active' : ''}
          onClick={() => setMobilePanel((panel) => (panel === 'actions' ? null : 'actions'))}
        >
          <SlidersHorizontal size={18} />
          Actions
        </button>
      </nav>
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="inspector-section">
      <div className="inspector-section-title">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InspectorField({
  label,
  value,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  if (multiline) {
    return (
      <label className="block">
        <span className="block text-[12px] mb-1" style={{ color: LABEL_TERTIARY }}>{label}</span>
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="inspector-input resize-none" />
      </label>
    );
  }

  return (
    <label className="block">
      <span className="block text-[12px] mb-1" style={{ color: LABEL_TERTIARY }}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="inspector-input" />
    </label>
  );
}

function InspectorNumber({
  label,
  value,
  min = 0,
  max = 100,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] mb-1 capitalize" style={{ color: LABEL_TERTIARY }}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="inspector-input"
      />
    </label>
  );
}

function InspectorSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] mb-1 capitalize" style={{ color: LABEL_TERTIARY }}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="inspector-input">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function PropsEditor({
  element,
  editLevel,
  onChange,
}: {
  element: ElementNode;
  editLevel: EditLevel;
  onChange: (key: string, value: string) => void;
}) {
  const hiddenSimpleProps = new Set(['alt', 'src']);
  const entries = Object.entries(element.props).filter(([key]) => {
    if (key === 'data') return false;
    if (editLevel === 'simple' && hiddenSimpleProps.has(key)) return false;
    return true;
  });
  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <InspectorField
          key={key}
          label={key}
          value={String(value)}
          multiline={MULTILINE_PROPS.has(key)}
          onChange={(next) => onChange(key, next)}
        />
      ))}
      {editLevel === 'advanced' && element.type === 'chart' && (
        <label className="block">
          <span className="block text-[12px] mb-1" style={{ color: LABEL_TERTIARY }}>data</span>
          <textarea
            value={chartDataText(element)}
            onChange={(event) => onChange('data', event.target.value)}
            rows={4}
            className="inspector-input resize-none"
          />
        </label>
      )}
    </div>
  );
}

function ActionEditor({
  action,
  scenes,
  elements,
  onChange,
}: {
  action: Action;
  scenes: Scene[];
  elements: ElementNode[];
  onChange: (action: Action) => void;
}) {
  return (
    <InspectorSection title="Navigation">
      <select
        value={action.kind}
        onChange={(event) => {
          const kind = event.target.value as Action['kind'];
          if (kind === 'none') onChange({ kind });
          else if (kind === 'scene') onChange({ kind, target: scenes[0]?.id ?? '' });
          else if (kind === 'anchor') onChange({ kind, target: elements[0]?.id ?? '' });
          else onChange({ kind, href: 'https://negativezero.one/' });
        }}
        className="inspector-input mb-2"
      >
        <option value="none">No action</option>
        <option value="scene">Scene</option>
        <option value="anchor">Anchor</option>
        <option value="url">URL</option>
      </select>
      {action.kind === 'scene' && (
        <select value={action.target} onChange={(event) => onChange({ ...action, target: event.target.value })} className="inspector-input">
          {scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.title}</option>)}
        </select>
      )}
      {action.kind === 'anchor' && (
        <select value={action.target} onChange={(event) => onChange({ ...action, target: event.target.value })} className="inspector-input">
          {elements.map((element) => <option key={element.id} value={element.id}>{element.id}</option>)}
        </select>
      )}
      {action.kind === 'url' && (
        <InspectorField label="href" value={action.href} onChange={(value) => onChange({ ...action, href: value })} />
      )}
      <div className="text-[12px] mt-2" style={{ color: LABEL_TERTIARY }}>{actionLabel(action)}</div>
    </InspectorSection>
  );
}

function chartDataText(element: ElementNode): string {
  const data = Array.isArray(element.props.data)
    ? (element.props.data as Array<{ label: string; value: number }>)
    : [];
  return data.map((item) => `${item.label}, ${item.value}`).join('\n');
}

function parseChartData(value: string): Array<{ label: string; value: number }> {
  return value
    .split('\n')
    .map((line) => {
      const [label, rawValue] = line.split(',').map((part) => part.trim());
      return { label: label || 'Item', value: Number(rawValue) || 0 };
    })
    .filter((item) => item.label);
}
