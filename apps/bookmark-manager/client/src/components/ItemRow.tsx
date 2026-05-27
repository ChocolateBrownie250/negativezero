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
import type { TreeNode } from '../lib/tree';

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

// 24px square selection indicator on the left edge of every row. Empty
// rounded square when unselected, blue with white check when selected.
// Always present so the affordance is obvious — clicking it (or the row)
// toggles selection. Square shape (not circle) reads as a checkbox per
// the user's request; gives a more deliberate "form control" feel than a
// round dot on iOS.
function SelectionDot({ selected }: { selected: boolean }) {
  return (
    <div
      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors"
      style={{
        background: selected ? COLORS.blue : COLORS.surface,
        boxShadow: selected
          ? 'inset 0 1px 0 rgba(255,255,255,0.20)'
          : `inset 0 0 0 1.5px ${RING_STRONG}`,
      }}
    >
      {selected && <Check size={16} strokeWidth={3} color="#fff" />}
    </div>
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
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const isFolder = node.type === 'folder';

  // Drop-target highlight wins over selection visual: it's the foreground
  // signal during a drag.
  const background = dropHighlight
    ? 'rgba(0,122,255,0.28)'
    : selected
      ? 'rgba(0,122,255,0.16)'
      : 'transparent';

  return (
    <div
      data-node-id={node.id}
      draggable={draggable}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors"
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
      <SelectionDot selected={selected} />
      {isFolder ? (
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: COLORS.surface,
            boxShadow: `inset 0 0 0 1px ${RING_SUBTLE}`,
          }}
        >
          <Folder size={20} color={COLORS.blue} fill={COLORS.blue} />
        </div>
      ) : (
        <Favicon url={node.faviconUrl} alt={node.name} />
      )}
      <div className="flex-1 min-w-0">
        <div
          className="text-[15px] font-medium truncate"
          style={{ color: LABEL_PRIMARY }}
        >
          {node.name}
        </div>
        <div className="text-[13px] truncate" style={{ color: LABEL_SECONDARY }}>
          {isFolder
            ? itemCount === 0
              ? 'Empty'
              : `${itemCount} item${itemCount === 1 ? '' : 's'}`
            : hostFromUrl(node.url)}
        </div>
      </div>
      {/* Primary action: enter folder / open bookmark */}
      {isFolder ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenFolder?.();
          }}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ color: LABEL_TERTIARY }}
          aria-label="Open folder"
          title="Open folder"
        >
          <ChevronRight size={20} />
        </button>
      ) : (
        <a
          href={externalLinkHref(node.url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ color: LABEL_TERTIARY, textDecoration: 'none' }}
          aria-label="Open bookmark"
          title="Open in new tab"
        >
          <ExternalLink size={18} />
        </a>
      )}
      {/* Reorder grip — visible only on desktop (when draggable=true).
          Drag-starts from this element are routed to reorder mode in
          BookmarkManager via the data-drag-handle attribute. Clicks are
          swallowed so it doesn't toggle row selection accidentally. */}
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
      {/* Per-row actions menu (existing 3-dot) */}
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
