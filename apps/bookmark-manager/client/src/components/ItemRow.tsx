import { useRef, useState, type DragEvent, type MouseEvent } from 'react';
import {
  Check,
  ChevronRight,
  ExternalLink,
  Folder,
  GripVertical,
  MoreHorizontal,
} from 'lucide-react';
import {
  COLORS,
  LABEL_PRIMARY,
  LABEL_SECONDARY,
  LABEL_TERTIARY,
  RING_STRONG,
  RING_SUBTLE,
  SEPARATOR,
} from '../lib/colors';
import { externalLinkHref, hostFromUrl } from '../lib/platform';
import { NODE_ICONS } from '../lib/nodeIcons';
import type { NodeIcon, TreeNode } from '../lib/tree';

interface Props {
  node: TreeNode;
  itemCount?: number;
  isLast: boolean;
  selected: boolean;
  draggable: boolean;
  // True while this row is part of an active drag (any dragged item).
  // Used to fade the source visually so the user can see the drop target.
  dragging: boolean;
  // For folder rows only: highlight as a valid drop target while a drag
  // hovers it.
  dropHighlight: boolean;
  // Reorder indicator drawn as a thin blue line at the top or bottom edge
  // of the row when a reorder-mode drag is hovering this row. Null = no
  // indicator. Independent of dropHighlight (which is the move-mode
  // background fill on folders).
  reorderIndicator: 'top' | 'bottom' | null;
  onSelect: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onOpenFolder?: () => void;
  onOpenActions: (anchor: HTMLElement) => void;
  onOpenIconPicker: (anchor: HTMLElement) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

function Favicon({ url, alt }: { url: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden shrink-0"
      style={{
        background: '#ffffff',
        boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.10)`,
      }}
    >
      {url && !errored ? (
        <img
          src={url}
          alt={alt}
          width={20}
          height={20}
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          style={{ width: 20, height: 20, objectFit: 'contain' }}
        />
      ) : (
        <span className="text-[13px] font-semibold" style={{ color: '#000' }}>
          {alt.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

// A custom node icon: an emoji or a named icon (from NODE_ICONS) on a chosen
// background color. Replaces the favicon / folder glyph when the user sets one.
function NodeGlyph({ icon }: { icon: NodeIcon }) {
  const Lucide = icon.lucide ? NODE_ICONS[icon.lucide] : null;
  return (
    <span
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
      style={{
        background: icon.bg,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
      }}
    >
      {icon.emoji ? (
        <span className="text-[18px] leading-none">{icon.emoji}</span>
      ) : Lucide ? (
        <Lucide size={20} color="#fff" />
      ) : null}
    </span>
  );
}

// 24px square selection indicator on the left edge of every row — a distinct
// tap zone for multi-select (stopPropagation, so it never triggers the row's
// open action). Tapping anywhere else on the row opens it (HIG: a list row is
// tappable; the trailing chevron is a disclosure indicator, not the only hit
// target). Hit area padded to 36px so it's comfortably tappable on touch.
function SelectionToggle({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      className="w-9 h-9 -m-1.5 flex items-center justify-center shrink-0 cursor-pointer"
      aria-label={selected ? 'Deselect' : 'Select'}
      aria-pressed={selected}
    >
      <span
        className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
        style={{
          background: selected ? COLORS.blue : COLORS.surface,
          boxShadow: selected
            ? 'inset 0 1px 0 rgba(255,255,255,0.20)'
            : `inset 0 0 0 1.5px ${RING_STRONG}`,
        }}
      >
        {selected && <Check size={16} strokeWidth={3} color="#fff" />}
      </span>
    </button>
  );
}

export default function ItemRow({
  node,
  itemCount,
  isLast,
  selected,
  draggable,
  dragging,
  dropHighlight,
  reorderIndicator,
  onSelect,
  onContextMenu,
  onOpenFolder,
  onOpenActions,
  onOpenIconPicker,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const isFolder = node.type === 'folder';
  // null for non-http(s) URLs — see externalLinkHref. Used to decide whether
  // the open target is a live link or an inert (disabled) element.
  const safeHref = isFolder ? null : externalLinkHref(node.url);

  // Drop-target highlight wins over selection visual: it's the foreground
  // signal during a drag.
  const background = dropHighlight
    ? 'rgba(91,147,240,0.30)'
    : selected
      ? 'rgba(91,147,240,0.18)'
      : 'transparent';

  // Open the item: navigate into a folder, or open the bookmark URL in a new
  // tab. Triggered by the dedicated outlined Open button and by a double-click
  // on the card body (Chrome-style: single click selects, double click opens).
  function openItem() {
    if (isFolder) {
      onOpenFolder?.();
      return;
    }
    if (safeHref) window.open(safeHref, '_blank', 'noopener,noreferrer');
  }

  // The card body: icon + title/subtitle. This is the SELECT + DRAG surface — a
  // single click selects (modifier-aware in the parent), a drag moves the item.
  // Opening is a separate, explicitly-bordered button so the two actions never
  // fight — this is what fixes click-select being swallowed by the open link.
  const iconButton = (
    <button
      type="button"
      data-icon-btn="1"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenIconPicker(e.currentTarget);
      }}
      className="shrink-0 rounded-lg transition-transform active:scale-95"
      aria-label="Change icon"
      title="Change icon — pick an emoji or color"
    >
      {node.icon ? (
        <NodeGlyph icon={node.icon} />
      ) : isFolder ? (
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_SUBTLE}`,
          }}
        >
          <Folder size={20} color={COLORS.blue} fill={COLORS.blue} />
        </span>
      ) : (
        <Favicon url={node.faviconUrl} alt={node.name} />
      )}
    </button>
  );
  const iconTitle = (
    <>
      {iconButton}
      <span className="flex-1 min-w-0 block">
        <span
          className="text-[15px] font-medium truncate block"
          style={{ color: LABEL_PRIMARY }}
        >
          {node.name}
        </span>
        <span
          className="text-[13px] truncate block"
          style={{ color: LABEL_SECONDARY }}
        >
          {isFolder
            ? itemCount === 0
              ? 'Empty'
              : `${itemCount} item${itemCount === 1 ? '' : 's'}`
            : hostFromUrl(node.url)}
        </span>
      </span>
    </>
  );

  return (
    <div
      data-node-id={node.id}
      draggable={draggable}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative flex items-center gap-3 px-4 py-3 select-none nz-row"
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${SEPARATOR}`,
        background,
        opacity: dragging ? 0.5 : 1,
        // Drop targets get a subtle inset ring on top of the background so
        // the highlight is visible even if the row is also selected.
        boxShadow: dropHighlight ? `inset 0 0 0 2px ${COLORS.blue}` : undefined,
      }}
    >
      {/* Reorder drop indicator: 2 px blue line above / below the row. */}
      {reorderIndicator === 'top' && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{ top: -1, height: 2, background: COLORS.blue, zIndex: 5 }}
        />
      )}
      {reorderIndicator === 'bottom' && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{ bottom: -1, height: 2, background: COLORS.blue, zIndex: 5 }}
        />
      )}
      <SelectionToggle selected={selected} onSelect={onSelect} />

      {/* Card body — single click SELECTS (modifier-aware in the parent),
          double click opens, and a drag moves the item. Deliberately NOT a
          link/navigate button: the open action lives in the bordered button to
          the right, so a plain click can select instead of navigating away. */}
      <div
        className="flex-1 flex items-center gap-3 min-w-0 text-left select-none"
        onClick={(e) => onSelect(e)}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openItem();
        }}
        style={{ cursor: draggable ? 'grab' : 'default' }}
      >
        {iconTitle}
      </div>

      {/* Open action — a clearly OUTLINED button so the click target for "open"
          is unmistakable and distinct from select/drag. Folder → navigate in;
          bookmark → open in a new tab (a real <a> for accessibility and to
          avoid popup blocking). A non-http(s) URL renders inert (no href,
          pointer-events off) so a hostile javascript:/data: URL that slipped
          past the server can't be opened. */}
      {isFolder ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenFolder?.();
          }}
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          style={{
            color: LABEL_SECONDARY,
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
          }}
          aria-label={`Open folder ${node.name}`}
          title="Open folder"
        >
          <ChevronRight size={18} />
        </button>
      ) : (
        <a
          href={safeHref ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          style={{
            color: LABEL_SECONDARY,
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
            textDecoration: 'none',
            pointerEvents: safeHref ? undefined : 'none',
            opacity: safeHref ? 1 : 0.4,
          }}
          aria-label={`Open ${node.name} in a new tab`}
          title={safeHref ? 'Open in new tab' : "This link can't be opened"}
        >
          <ExternalLink size={17} />
        </a>
      )}

      {/* Reorder grip — visible only on desktop (when draggable=true).
          Drag-starts from this element are routed to reorder mode in
          BookmarkManager via the data-drag-handle attribute. Clicks are
          swallowed so it doesn't open the row accidentally. */}
      {draggable && (
        <span
          data-drag-handle="1"
          onClick={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ color: LABEL_TERTIARY, cursor: 'grab' }}
          aria-label="Drag to reorder"
          title="Drag to reorder within this folder"
        >
          <GripVertical size={18} />
        </span>
      )}

      {/* Per-row actions menu (3-dot) */}
      <button
        ref={moreRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (moreRef.current) onOpenActions(moreRef.current);
        }}
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ color: LABEL_TERTIARY }}
        aria-label="Actions"
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
