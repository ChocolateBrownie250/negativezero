import { Check, FolderInput, Trash2, X, ExternalLink } from 'lucide-react';
import {
  COLORS,
  LABEL_PRIMARY,
  RING_STRONG,
} from '../lib/colors';

interface Props {
  count: number;
  total: number;
  bookmarkCount: number; // selected items that are bookmarks (for Open All button)
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  onMove: () => void;
  onOpenAll: () => void;
}

// Sticky toolbar shown above the list when the user has at least one
// item selected. Mirrors the macOS Finder pattern: count on the left,
// bulk actions on the right, Done to exit selection mode.
export default function SelectionToolbar({
  count,
  total,
  bookmarkCount,
  onSelectAll,
  onClear,
  onDelete,
  onMove,
  onOpenAll,
}: Props) {
  const allSelected = count >= total && total > 0;

  return (
    <div
      className="sticky top-0 z-30 -mx-4 px-4 py-2 mb-3 backdrop-blur-md"
      style={{
        // Deep-blue liquid-glass surface matching the app's .glass-surface
        // primitive (menus/toast). Was a leftover flat grey rgba(20,20,24) from
        // the pre-blue-theme palette, which clashed with the rest of the UI.
        // Inlined (not the class) so it can't override `position: sticky`.
        background:
          'linear-gradient(177deg, rgba(110,140,205,0.16) 0%, rgba(60,84,152,0.09) 100%), rgba(16,26,52,0.82)',
        boxShadow: `0 1px 0 ${RING_STRONG}`,
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: COLORS.surface, color: LABEL_PRIMARY }}
          aria-label="Clear selection"
          title="Clear selection (Esc)"
        >
          <X size={18} />
        </button>
        <div
          className="text-[15px] font-semibold flex-1 truncate"
          style={{ color: LABEL_PRIMARY }}
        >
          {count} selected
        </div>
        <button
          type="button"
          onClick={allSelected ? onClear : onSelectAll}
          className="px-3 h-9 rounded-full text-[13px] font-medium flex items-center gap-1"
          style={{ background: COLORS.surface, color: LABEL_PRIMARY }}
        >
          {allSelected ? (
            <>Deselect all</>
          ) : (
            <>
              <Check size={14} /> Select all
            </>
          )}
        </button>
        {bookmarkCount > 0 && (
          <button
            type="button"
            onClick={onOpenAll}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: COLORS.surface, color: LABEL_PRIMARY }}
            aria-label={`Open ${bookmarkCount} bookmark${bookmarkCount === 1 ? '' : 's'}`}
            title={`Open ${bookmarkCount} bookmark${bookmarkCount === 1 ? '' : 's'} in new tabs`}
          >
            <ExternalLink size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={onMove}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: COLORS.surface, color: LABEL_PRIMARY }}
          aria-label={`Move ${count} item${count === 1 ? '' : 's'}`}
          title={`Move ${count} item${count === 1 ? '' : 's'} to another folder`}
        >
          <FolderInput size={18} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          // Destructive idiom used everywhere else in the app: a red glyph on a
          // translucent red tint (matches the rgba tint language of the other
          // surfaces) rather than a loud solid-coral fill that broke the theme.
          style={{ background: 'rgba(255,106,134,0.18)', color: COLORS.red }}
          aria-label={`Delete ${count} item${count === 1 ? '' : 's'}`}
          title={`Delete ${count} item${count === 1 ? '' : 's'}`}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
