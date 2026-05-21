import { useState, type ReactElement } from 'react';
import { Folder } from 'lucide-react';
import Modal from './Modal';
import type { TreeFolder } from '../../lib/tree';
import {
  COLORS,
  LABEL_PRIMARY,
  LABEL_SECONDARY,
  RING_STRONG,
} from '../../lib/colors';

interface Props {
  tree: TreeFolder;
  // The IDs the user is moving. Folders within this set (and their
  // descendants) become invalid destinations because moving a folder
  // into itself / its descendant would create a cycle. The current
  // parent (where items already live) is also excluded as a no-op.
  selectedIds: ReadonlySet<string>;
  // Where the items currently live — disabled in the picker since
  // moving to the current parent is a no-op.
  currentParentId: string;
  onClose: () => void;
  onMove: (toFolderId: string) => Promise<void> | void;
}

function collectDescendants(folder: TreeFolder, into: Set<string>) {
  into.add(folder.id);
  for (const c of folder.children) {
    if (c.type === 'folder') collectDescendants(c, into);
  }
}

export default function MoveModal({
  tree,
  selectedIds,
  currentParentId,
  onClose,
  onMove,
}: Props) {
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Forbidden = self + descendants of any selected folder.
  const forbidden = (() => {
    const out = new Set<string>();
    function walk(node: TreeFolder) {
      if (selectedIds.has(node.id)) {
        collectDescendants(node, out);
        return;
      }
      for (const c of node.children) {
        if (c.type === 'folder') walk(c);
      }
    }
    walk(tree);
    return out;
  })();

  async function handleMove(folderId: string) {
    if (submitting) return;
    setSubmitting(folderId);
    try {
      await onMove(folderId);
      onClose();
    } catch {
      setSubmitting(null);
    }
  }

  function renderFolder(
    folder: TreeFolder,
    depth: number,
    isRoot = false,
  ): ReactElement[] {
    const isForbidden = forbidden.has(folder.id);
    const isCurrent = folder.id === currentParentId;
    const disabled = isForbidden || isCurrent || !!submitting;
    const rows: ReactElement[] = [];
    rows.push(
      <button
        key={folder.id}
        type="button"
        disabled={disabled}
        onClick={() => void handleMove(folder.id)}
        className="w-full flex items-center gap-2 py-2 rounded-lg text-left disabled:opacity-40 hover:bg-white/5"
        style={{
          paddingLeft: 12 + depth * 18,
          paddingRight: 12,
          color: LABEL_PRIMARY,
        }}
      >
        <Folder size={16} color={COLORS.blue} fill={COLORS.blue} />
        <span className="truncate text-[14px]">
          {isRoot ? 'Bookmarks' : folder.name}
        </span>
        {(isForbidden || isCurrent) && (
          <span
            className="ml-auto text-[11px]"
            style={{ color: LABEL_SECONDARY }}
          >
            {isCurrent ? 'current' : 'self'}
          </span>
        )}
      </button>,
    );
    for (const c of folder.children) {
      if (c.type === 'folder') {
        rows.push(...renderFolder(c, depth + 1));
      }
    }
    return rows;
  }

  return (
    <Modal title="Move to" onClose={onClose}>
      <div
        className="max-h-[60vh] overflow-auto rounded-xl mb-3"
        style={{
          background: COLORS.surface,
          boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
        }}
      >
        {renderFolder(tree, 0, true)}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl py-3 text-white font-medium"
        style={{
          background: COLORS.surface,
          boxShadow: `inset 0 0 0 1px ${RING_STRONG}`,
        }}
      >
        Cancel
      </button>
    </Modal>
  );
}
