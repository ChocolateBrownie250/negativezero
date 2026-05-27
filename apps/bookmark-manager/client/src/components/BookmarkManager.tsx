import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { api, UnauthorizedError } from '../api';
import {
  buildTree,
  collectBookmarkUrls,
  countDescendantBookmarks,
  countItems,
  findFolder,
  type ApiNode,
  type TreeFolder,
  type TreeNode,
} from '../lib/tree';
import {
  COLORS,
  LABEL_PRIMARY,
  LABEL_SECONDARY,
  LABEL_TERTIARY,
  RING_SUBTLE,
} from '../lib/colors';
import { externalLinkHref } from '../lib/platform';
import ItemRow from './ItemRow';
import EmptyState from './EmptyState';
import Toast from './Toast';
import SelectionToolbar from './SelectionToolbar';
import AddMenu from './menus/AddMenu';
import OptionsMenu from './menus/OptionsMenu';
import RowActionsMenu from './menus/RowActionsMenu';
import ContextMenu from './menus/ContextMenu';
import MenuItem from './menus/MenuItem';
import BookmarkModal from './modals/BookmarkModal';
import FolderModal from './modals/FolderModal';
import RenameModal from './modals/RenameModal';
import ImportModal from './modals/ImportModal';
import MoveModal from './modals/MoveModal';

interface Props {
  onUnauthorized: () => void;
}

type RowMenuState = { anchor: HTMLElement; nodeId: string } | null;

type ModalState =
  | { kind: 'add-bookmark' }
  | { kind: 'add-folder' }
  | { kind: 'import' }
  | { kind: 'rename'; nodeId: string }
  | { kind: 'move'; ids: string[] }
  | null;

// Right-click context menu — variant A is over a row (shows row-aware
// actions), variant B is over the empty list area (shows add-here).
type CtxMenu =
  | { kind: 'row'; x: number; y: number; nodeId: string }
  | { kind: 'empty'; x: number; y: number }
  | null;

// Marquee selection box during a mouse drag on the empty list area.
interface Marquee {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  baseSelected: ReadonlySet<string>; // selection at the moment drag began
  additive: boolean; // shift/cmd held when drag started: union with baseSelected
}

// HTML5 drag-and-drop state for moving items into folders. Mouse-only:
// touch events don't fire dragstart on iOS Safari, so this whole pathway
// is gated behind matchMedia('(pointer: fine)') in the renderer.
interface DragState {
  // 'move' = dragged from row body — drop on a folder moves into it.
  // 'reorder' = dragged from the GripVertical handle — drop on a sibling
  //   re-positions within the same parent.
  mode: 'move' | 'reorder';
  ids: ReadonlySet<string>; // node IDs being dragged
  forbiddenFolders: ReadonlySet<string>; // self + descendants (cycle prevention; move-mode only)
}

// While reorder-dragging, where the drop indicator should land.
type ReorderTarget = { id: string; side: 'top' | 'bottom' } | null;

const BASE_URL = import.meta.env.BASE_URL; // '/services/bookmark-manager/' in prod, '/' in dev
const PATH_PREFIX = 'f/';

// Decode the current URL into the list of folder IDs to descend into.
// '/services/bookmark-manager/'           → []
// '/services/bookmark-manager/f/abc'      → ['abc']
// '/services/bookmark-manager/f/abc/def'  → ['abc', 'def']
function pathFromLocation(): string[] {
  const after = window.location.pathname.startsWith(BASE_URL)
    ? window.location.pathname.slice(BASE_URL.length)
    : window.location.pathname.replace(/^\/+/, '');
  if (!after.startsWith(PATH_PREFIX)) return [];
  return after.slice(PATH_PREFIX.length).split('/').filter(Boolean);
}

// Build the URL string for a given path. Empty path → base only.
function locationFromPath(path: string[]): string {
  if (path.length === 0) return BASE_URL;
  return BASE_URL + PATH_PREFIX + path.join('/') + '/';
}

// Did two click points come from the same place (no significant drag)?
function isClick(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4;
}

export default function BookmarkManager({ onUnauthorized }: Props) {
  const [tree, setTree] = useState<TreeFolder | null>(null);
  const [path, setPath] = useState<string[]>(() => pathFromLocation());
  const [toast, setToast] = useState<string | null>(null);
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);
  const [optionsAnchor, setOptionsAnchor] = useState<HTMLElement | null>(null);
  const [rowMenu, setRowMenu] = useState<RowMenuState>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget>(null);

  // Mouse-only feature surface (drag-and-drop, marquee). Computed once
  // per render — cheap to keep in sync with viewport changes if a user
  // toggles between trackpad and touch.
  const isMouse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: fine)').matches;

  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const optionsBtnRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLElement | null>(null);

  function handleApiError(err: unknown) {
    if (err instanceof UnauthorizedError) {
      onUnauthorized();
      return true;
    }
    return false;
  }

  const refetch = useCallback(async (): Promise<TreeFolder | null> => {
    try {
      const { nodes } = await api.listNodes();
      const t = buildTree(nodes as ApiNode[]);
      setTree(t);
      return t;
    } catch (err) {
      if (handleApiError(err)) return null;
      setToast('Could not load bookmarks');
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Browser back/forward updates the in-app folder path.
  useEffect(() => {
    function onPop() {
      setPath(pathFromLocation());
      // Crossing folders cancels selection — items don't exist on the
      // new screen.
      setSelected(new Set());
      setAnchor(null);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Whenever path changes via in-app navigation, push a history entry.
  // We compare with the live location to avoid double-pushing on popstate.
  useEffect(() => {
    const target = locationFromPath(path);
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target);
    }
  }, [path]);

  const currentFolder = useMemo<TreeFolder | null>(() => {
    if (!tree) return null;
    let cur: TreeFolder = tree;
    for (const id of path) {
      const next = findFolder(tree, id);
      if (!next) return cur;
      cur = next;
    }
    return cur;
  }, [tree, path]);

  // If the URL refers to a folder that no longer exists (e.g. deleted in
  // another tab), trim the path back to what's resolvable.
  useEffect(() => {
    if (!tree || path.length === 0) return;
    const resolved: string[] = [];
    let cur: TreeFolder = tree;
    for (const id of path) {
      const next = findFolder(tree, id);
      if (!next) break;
      resolved.push(id);
      cur = next;
    }
    void cur;
    if (resolved.length !== path.length) setPath(resolved);
  }, [tree, path]);

  function navigateInto(id: string) {
    setPath((p) => [...p, id]);
    setSelected(new Set());
    setAnchor(null);
  }

  function navigateBack() {
    setPath((p) => p.slice(0, -1));
    setSelected(new Set());
    setAnchor(null);
  }

  function nodeById(id: string): TreeNode | null {
    if (!tree) return null;
    function walk(node: TreeNode): TreeNode | null {
      if (node.id === id) return node;
      if (node.type === 'folder') {
        for (const c of node.children) {
          const r = walk(c);
          if (r) return r;
        }
      }
      return null;
    }
    return walk(tree);
  }

  // ---- Selection ----------------------------------------------------

  function setOnly(id: string) {
    setSelected(new Set([id]));
    setAnchor(id);
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  }

  function selectRange(toId: string) {
    if (!currentFolder) return;
    const ids = currentFolder.children.map((c) => c.id);
    const fromId = anchor ?? toId;
    const a = ids.indexOf(fromId);
    const b = ids.indexOf(toId);
    if (a < 0 || b < 0) {
      setOnly(toId);
      return;
    }
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    setSelected((s) => {
      const next = new Set(s);
      for (let i = lo; i <= hi; i++) next.add(ids[i]);
      return next;
    });
  }

  function onRowSelect(id: string, e: MouseEvent) {
    // Shift always extends a range from the anchor (Finder-style).
    if (e.shiftKey && anchor) {
      selectRange(id);
      return;
    }
    // Cmd/Ctrl is the explicit "toggle" modifier on desktop.
    if (e.metaKey || e.ctrlKey) {
      toggle(id);
      return;
    }
    // Plain click — semantics differ by input device:
    //  • mouse (pointer:fine): single click REPLACES selection with this row.
    //    The user multi-selects via Cmd-click / Shift-click / marquee.
    //  • touch (pointer:coarse): single tap TOGGLES, so you can build a
    //    multi-selection with no modifier keys (the only practical option
    //    on a phone).
    if (isMouse) setOnly(id);
    else toggle(id);
  }

  function clearSelection() {
    setSelected(new Set());
    setAnchor(null);
  }

  function selectAll() {
    if (!currentFolder) return;
    setSelected(new Set(currentFolder.children.map((c) => c.id)));
  }

  // ---- HTML5 drag-and-drop (mouse only) ----------------------------

  // Build the set of folder IDs that would create a cycle if any of the
  // dragged folders were dropped into them. That's each dragged folder
  // itself and all its descendants. Bookmarks have no descendants and
  // never appear here.
  function computeForbidden(ids: ReadonlySet<string>): Set<string> {
    const out = new Set<string>();
    if (!tree) return out;
    function walk(node: TreeFolder) {
      if (ids.has(node.id)) {
        const stack: TreeFolder[] = [node];
        while (stack.length) {
          const cur = stack.pop()!;
          out.add(cur.id);
          for (const c of cur.children) {
            if (c.type === 'folder') stack.push(c);
          }
        }
        return;
      }
      for (const c of node.children) {
        if (c.type === 'folder') walk(c);
      }
    }
    walk(tree);
    return out;
  }

  function onRowDragStart(id: string, e: DragEvent) {
    if (!isMouse) {
      // Touch devices can't reliably fire dragstart for our purposes;
      // bail to avoid stuck drag state.
      e.preventDefault();
      return;
    }
    // Detect mode: dragstart fired from inside the GripVertical handle
    // means "reorder", otherwise "move".
    const target = e.target as HTMLElement | null;
    const isReorder = !!target?.closest('[data-drag-handle]');

    // If the dragged row is in the existing selection, drag the whole
    // selection. Otherwise replace selection with just this row (Finder
    // behaviour) and drag only it.
    let ids: Set<string>;
    if (selected.has(id)) {
      ids = new Set(selected);
    } else {
      ids = new Set([id]);
      setOnly(id);
    }
    setDragState({
      mode: isReorder ? 'reorder' : 'move',
      ids,
      forbiddenFolders: isReorder ? new Set() : computeForbidden(ids),
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', Array.from(ids).join(','));
  }

  function onRowDragEnd() {
    setDragState(null);
    setDropFolder(null);
    setReorderTarget(null);
  }

  function isValidMoveTarget(folderId: string): boolean {
    if (!dragState) return false;
    if (dragState.forbiddenFolders.has(folderId)) return false;
    if (folderId === currentFolder?.id) return false;
    return true;
  }

  function isValidReorderTarget(rowId: string): boolean {
    if (!dragState) return false;
    // Reorder is bounded to the current folder — the target row must be
    // a direct child of currentFolder, and must not be one of the rows
    // being dragged.
    if (!currentFolder) return false;
    if (dragState.ids.has(rowId)) return false;
    return currentFolder.children.some((c) => c.id === rowId);
  }

  function onRowDragOver(rowId: string, isFolder: boolean, e: DragEvent) {
    if (!dragState) return;
    if (dragState.mode === 'move') {
      // Move mode: drop only on folders.
      if (!isFolder || !isValidMoveTarget(rowId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropFolder !== rowId) setDropFolder(rowId);
      return;
    }
    // Reorder mode: any sibling row works as a drop target. We pick
    // top-or-bottom from where the cursor is relative to the row's
    // vertical midpoint.
    if (!isValidReorderTarget(rowId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rowEl = e.currentTarget as HTMLElement;
    const rect = rowEl.getBoundingClientRect();
    const side: 'top' | 'bottom' =
      e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    if (
      reorderTarget?.id !== rowId ||
      reorderTarget?.side !== side
    ) {
      setReorderTarget({ id: rowId, side });
    }
  }

  function onRowDragLeave(rowId: string) {
    setDropFolder((prev) => (prev === rowId ? null : prev));
    setReorderTarget((prev) => (prev?.id === rowId ? null : prev));
  }

  async function reorderTo(target: { id: string; side: 'top' | 'bottom' }) {
    if (!dragState || !currentFolder) return;
    const draggedIds = dragState.ids;
    const allIds = currentFolder.children.map((c) => c.id);
    if (draggedIds.has(target.id)) return; // shouldn't happen, but defensive
    const sourceOrdered = allIds.filter((id) => draggedIds.has(id));
    const remaining = allIds.filter((id) => !draggedIds.has(id));
    const targetIdx = remaining.indexOf(target.id);
    if (targetIdx < 0) return;
    const insertIdx = target.side === 'top' ? targetIdx : targetIdx + 1;
    const finalOrder = [
      ...remaining.slice(0, insertIdx),
      ...sourceOrdered,
      ...remaining.slice(insertIdx),
    ];
    try {
      await api.reorderChildren(currentFolder.id, finalOrder);
      await refetch();
    } catch (err) {
      if (handleApiError(err)) return;
      setToast('Reorder failed');
    }
  }

  function onRowDrop(rowId: string, isFolder: boolean, e: DragEvent) {
    e.preventDefault();
    if (!dragState) {
      onRowDragEnd();
      return;
    }
    if (dragState.mode === 'move') {
      if (!isFolder || !isValidMoveTarget(rowId)) {
        onRowDragEnd();
        return;
      }
      const ids = Array.from(dragState.ids);
      onRowDragEnd();
      void moveItems(ids, rowId);
      return;
    }
    // Reorder
    if (!isValidReorderTarget(rowId) || !reorderTarget) {
      onRowDragEnd();
      return;
    }
    const t = reorderTarget;
    onRowDragEnd();
    void reorderTo(t);
  }

  // ---- Marquee ------------------------------------------------------

  function onListPointerDown(e: PointerEvent<HTMLElement>) {
    // Only left mouse button; and only when the press lands on the list
    // background, not a row or button. Touch input is ignored — taps go
    // through onClick.
    if (e.pointerType === 'touch') return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-id]')) return;
    if (target.closest('button, a')) return;
    setMarquee({
      startX: e.clientX,
      startY: e.clientY,
      endX: e.clientX,
      endY: e.clientY,
      baseSelected: e.shiftKey || e.metaKey || e.ctrlKey ? new Set(selected) : new Set(),
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onListPointerMove(e: PointerEvent<HTMLElement>) {
    if (!marquee) return;
    const next = { ...marquee, endX: e.clientX, endY: e.clientY };
    setMarquee(next);
    // Compute which rows intersect the marquee box, in viewport coords.
    const list = listRef.current;
    if (!list) return;
    const x1 = Math.min(next.startX, next.endX);
    const y1 = Math.min(next.startY, next.endY);
    const x2 = Math.max(next.startX, next.endX);
    const y2 = Math.max(next.startY, next.endY);
    const hit = new Set<string>(next.baseSelected);
    list.querySelectorAll<HTMLElement>('[data-node-id]').forEach((el) => {
      const id = el.dataset.nodeId;
      if (!id) return;
      const r = el.getBoundingClientRect();
      if (r.right >= x1 && r.left <= x2 && r.bottom >= y1 && r.top <= y2) {
        hit.add(id);
      } else if (!next.additive) {
        // already excluded by virtue of baseSelected being empty
      }
    });
    setSelected(hit);
  }

  function onListPointerUp(e: PointerEvent<HTMLElement>) {
    if (!marquee) return;
    const wasClick = isClick(
      { x: marquee.startX, y: marquee.startY },
      { x: e.clientX, y: e.clientY },
    );
    setMarquee(null);
    // Click on empty space without modifiers → clear selection.
    if (wasClick && !marquee.additive) clearSelection();
  }

  // ---- Right-click context menu ------------------------------------

  function onRowContextMenu(id: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!selected.has(id)) {
      setOnly(id);
    }
    setCtxMenu({ kind: 'row', x: e.clientX, y: e.clientY, nodeId: id });
  }

  function onListContextMenu(e: MouseEvent) {
    // Only fires when the right-click landed outside any row.
    if ((e.target as HTMLElement).closest('[data-node-id]')) return;
    e.preventDefault();
    setCtxMenu({ kind: 'empty', x: e.clientX, y: e.clientY });
  }

  // ---- Mutations ----------------------------------------------------

  async function addBookmark(input: { url: string; name: string }) {
    if (!currentFolder) return;
    try {
      await api.createNode({
        type: 'bookmark',
        parentId: currentFolder.id,
        url: input.url,
        name: input.name || undefined,
      });
      await refetch();
    } catch (err) {
      if (handleApiError(err)) throw err;
      throw err;
    }
  }

  async function addFolder(input: { name: string }) {
    if (!currentFolder) return;
    try {
      await api.createNode({
        type: 'folder',
        parentId: currentFolder.id,
        name: input.name,
      });
      await refetch();
    } catch (err) {
      if (handleApiError(err)) throw err;
      throw err;
    }
  }

  async function deleteOne(id: string) {
    const node = nodeById(id);
    if (!node) return;
    const confirmMsg =
      node.type === 'folder' && node.children.length > 0
        ? `Delete "${node.name}" and everything inside?`
        : `Delete "${node.name}"?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await api.deleteNode(id);
      setSelected((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      await refetch();
    } catch (err) {
      if (handleApiError(err)) return;
      setToast('Delete failed');
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const items = ids.map((id) => nodeById(id)).filter((n): n is TreeNode => !!n);
    const folderCount = items.filter((n) => n.type === 'folder').length;
    const bookmarkCount = items.length - folderCount;
    const parts = [];
    if (folderCount) parts.push(`${folderCount} folder${folderCount === 1 ? '' : 's'}`);
    if (bookmarkCount)
      parts.push(`${bookmarkCount} bookmark${bookmarkCount === 1 ? '' : 's'}`);
    if (!window.confirm(`Delete ${parts.join(' and ')}?`)) return;
    try {
      // Sequential to keep server's tree-delete logic ordering predictable
      // (deleting a parent folder cascades children; doing parents first
      // avoids 404 noise when we then try to delete already-cascaded children).
      for (const id of ids) {
        try {
          await api.deleteNode(id);
        } catch {
          // ignore individual failures (likely cascaded already)
        }
      }
      clearSelection();
      await refetch();
    } catch (err) {
      if (handleApiError(err)) return;
      setToast('Delete failed');
    }
  }

  async function moveItems(ids: string[], toFolderId: string) {
    try {
      // Sequential to keep cycle / position handling predictable on the
      // server. Failures are ignored individually so a single bad move
      // (e.g. node deleted in another tab) doesn't abort the rest.
      for (const id of ids) {
        try {
          await api.patchNode(id, { parentId: toFolderId });
        } catch {
          // ignore
        }
      }
      clearSelection();
      await refetch();
      setToast(ids.length === 1 ? 'Moved' : `Moved ${ids.length} items`);
    } catch (err) {
      if (handleApiError(err)) throw err;
      setToast('Move failed');
    }
  }

  async function renameNode(id: string, name: string, url?: string) {
    try {
      await api.patchNode(id, url ? { name, url } : { name });
      await refetch();
    } catch (err) {
      if (handleApiError(err)) throw err;
      throw err;
    }
  }

  async function copyLink(url: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setToast('Link copied');
    } catch {
      setToast('Copy failed');
    }
  }

  function openUrls(urls: string[]) {
    if (urls.length === 0) return;
    for (const url of urls) {
      const a = document.createElement('a');
      a.href = externalLinkHref(url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setToast(`Opening ${urls.length} tab${urls.length === 1 ? '' : 's'}`);
  }

  function openAllInFolder(folder: TreeFolder) {
    openUrls(collectBookmarkUrls(folder));
  }

  function openSelectedBookmarks() {
    const urls: string[] = [];
    for (const id of selected) {
      const n = nodeById(id);
      if (n && n.type === 'bookmark') urls.push(n.url);
    }
    openUrls(urls);
  }

  function exportNow() {
    const a = document.createElement('a');
    a.href = BASE_URL + 'api/export';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setToast('Exported');
  }

  async function importNow(treeIn: unknown) {
    try {
      await api.importTree(treeIn);
      await refetch();
      setPath([]);
      setToast('Imported');
    } catch (err) {
      if (handleApiError(err)) throw err;
      throw err;
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    onUnauthorized();
  }

  // Esc clears selection and closes the marquee.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (ctxMenu) return; // ContextMenu handles its own Esc
        if (selected.size > 0) clearSelection();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected.size, ctxMenu]);

  if (!tree || !currentFolder) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/40 text-sm">
        Loading...
      </div>
    );
  }

  const isRoot = path.length === 0;
  const parentName = (() => {
    if (isRoot) return null;
    if (path.length === 1) return tree.name;
    const parentId = path[path.length - 2];
    const f = findFolder(tree, parentId);
    return f?.name ?? 'Bookmarks';
  })();

  const totalCount = countItems(currentFolder);
  const subtitle =
    totalCount === 0 ? 'Empty' : `${totalCount} item${totalCount === 1 ? '' : 's'}`;

  const rowMenuNode = rowMenu ? nodeById(rowMenu.nodeId) : null;
  const renameNodeRef = modal?.kind === 'rename' ? nodeById(modal.nodeId) : null;

  // Used by the SelectionToolbar's "Open all" button: count how many of
  // the currently-selected items are bookmarks.
  const selectedBookmarkCount = (() => {
    let n = 0;
    for (const id of selected) {
      const x = nodeById(id);
      if (x && x.type === 'bookmark') n += 1;
    }
    return n;
  })();

  // The right-click context menu for a single row mirrors RowActionsMenu
  // but is positioned at the click point. For multiple rows it shows
  // bulk actions.
  const ctxRowNode =
    ctxMenu?.kind === 'row' ? nodeById(ctxMenu.nodeId) : null;
  const ctxIsBulk = ctxMenu?.kind === 'row' && selected.size > 1;

  return (
    <div
      className="min-h-screen"
      style={{ background: COLORS.bg, color: LABEL_PRIMARY }}
    >
      <div className="max-w-2xl mx-auto px-4 pt-[max(env(safe-area-inset-top),16px)] pb-12">
        {selected.size > 0 ? (
          <SelectionToolbar
            count={selected.size}
            total={currentFolder.children.length}
            bookmarkCount={selectedBookmarkCount}
            onSelectAll={selectAll}
            onClear={clearSelection}
            onDelete={deleteSelected}
            onMove={() =>
              setModal({ kind: 'move', ids: Array.from(selected) })
            }
            onOpenAll={openSelectedBookmarks}
          />
        ) : (
          <header className="pt-2 pb-4">
            <div className="flex items-center justify-between min-h-[36px]">
              {!isRoot ? (
                <button
                  type="button"
                  onClick={navigateBack}
                  className="flex items-center gap-1 text-[15px] font-medium"
                  style={{ color: COLORS.blue, background: 'transparent' }}
                >
                  <ChevronLeft size={18} />
                  {parentName}
                </button>
              ) : (
                <span />
              )}
              <button
                ref={optionsBtnRef}
                type="button"
                onClick={() => setOptionsAnchor(optionsBtnRef.current)}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                aria-label="Options"
                style={{ background: COLORS.surface, color: LABEL_SECONDARY }}
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h1
                  className="text-[34px] font-bold tracking-tight truncate"
                  style={{ color: LABEL_PRIMARY }}
                >
                  {currentFolder.name}
                </h1>
                <p className="text-[13px]" style={{ color: LABEL_SECONDARY }}>
                  {subtitle}
                </p>
              </div>
              <button
                ref={addBtnRef}
                type="button"
                onClick={() => setAddMenuAnchor(addBtnRef.current)}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                aria-label="Add"
                style={{
                  background: COLORS.blue,
                  color: '#fff',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
                }}
              >
                <Plus size={20} />
              </button>
            </div>
          </header>
        )}

        <main
          ref={(el) => {
            listRef.current = el;
          }}
          className="rounded-2xl overflow-hidden relative"
          style={{
            background: COLORS.card,
            boxShadow: `0 0 0 1px ${RING_SUBTLE}`,
            minHeight: 80,
          }}
          onPointerDown={onListPointerDown}
          onPointerMove={onListPointerMove}
          onPointerUp={onListPointerUp}
          onPointerCancel={() => setMarquee(null)}
          onContextMenu={onListContextMenu}
        >
          {currentFolder.children.length === 0 ? (
            <EmptyState />
          ) : (
            currentFolder.children.map((child, idx) => (
              <ItemRow
                key={child.id}
                node={child}
                isLast={idx === currentFolder.children.length - 1}
                itemCount={
                  child.type === 'folder' ? countItems(child) : undefined
                }
                selected={selected.has(child.id)}
                draggable={isMouse}
                dragging={dragState?.ids.has(child.id) ?? false}
                dropHighlight={
                  child.type === 'folder' &&
                  dragState?.mode === 'move' &&
                  dropFolder === child.id
                }
                reorderIndicator={
                  dragState?.mode === 'reorder' &&
                  reorderTarget?.id === child.id
                    ? reorderTarget.side
                    : null
                }
                onSelect={(e) => onRowSelect(child.id, e)}
                onContextMenu={(e) => onRowContextMenu(child.id, e)}
                onOpenFolder={
                  child.type === 'folder' ? () => navigateInto(child.id) : undefined
                }
                onOpenActions={(anchorEl) =>
                  setRowMenu({ anchor: anchorEl, nodeId: child.id })
                }
                onDragStart={(e) => onRowDragStart(child.id, e)}
                onDragEnd={onRowDragEnd}
                onDragOver={(e) =>
                  onRowDragOver(child.id, child.type === 'folder', e)
                }
                onDragLeave={() => onRowDragLeave(child.id)}
                onDrop={(e) =>
                  onRowDrop(child.id, child.type === 'folder', e)
                }
              />
            ))
          )}

          {/* Marquee selection rectangle — drawn relative to the viewport. */}
          {marquee && (
            <div
              className="fixed pointer-events-none rounded-xs"
              style={{
                left: Math.min(marquee.startX, marquee.endX),
                top: Math.min(marquee.startY, marquee.endY),
                width: Math.abs(marquee.endX - marquee.startX),
                height: Math.abs(marquee.endY - marquee.startY),
                background: 'rgba(0,122,255,0.15)',
                boxShadow: '0 0 0 1px rgba(0,122,255,0.55)',
                zIndex: 40,
              }}
            />
          )}
        </main>

        <p
          className="text-[12px] text-center mt-4"
          style={{ color: LABEL_TERTIARY }}
        >
          Tap a row to select it. Use the chevron / arrow on the right to open.
        </p>
      </div>

      {addMenuAnchor && (
        <AddMenu
          anchorEl={addMenuAnchor}
          onClose={() => setAddMenuAnchor(null)}
          onAddBookmark={() => setModal({ kind: 'add-bookmark' })}
          onAddFolder={() => setModal({ kind: 'add-folder' })}
        />
      )}
      {optionsAnchor && (
        <OptionsMenu
          anchorEl={optionsAnchor}
          onClose={() => setOptionsAnchor(null)}
          onExport={exportNow}
          onImport={() => setModal({ kind: 'import' })}
          onLogout={logout}
          exportDisabled={countItems(tree) === 0}
        />
      )}
      {rowMenu && rowMenuNode && (
        <RowActionsMenu
          anchorEl={rowMenu.anchor}
          onClose={() => setRowMenu(null)}
          kind={rowMenuNode.type}
          bookmarkCount={
            rowMenuNode.type === 'folder'
              ? countDescendantBookmarks(rowMenuNode)
              : undefined
          }
          onCopyLink={
            rowMenuNode.type === 'bookmark'
              ? () => copyLink(rowMenuNode.url)
              : undefined
          }
          onOpenAll={
            rowMenuNode.type === 'folder'
              ? () => openAllInFolder(rowMenuNode)
              : undefined
          }
          onRename={() => setModal({ kind: 'rename', nodeId: rowMenuNode.id })}
          onDelete={() => void deleteOne(rowMenuNode.id)}
        />
      )}

      {/* Right-click context menu */}
      {ctxMenu?.kind === 'row' && ctxRowNode && !ctxIsBulk && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
          {ctxRowNode.type === 'bookmark' && (
            <>
              <MenuItem
                icon={<ExternalLink size={18} color={LABEL_SECONDARY} />}
                label="Open in new tab"
                onClick={() => {
                  openUrls([ctxRowNode.url]);
                  setCtxMenu(null);
                }}
              />
              <MenuItem
                icon={<Copy size={18} color={LABEL_SECONDARY} />}
                label="Copy Link"
                onClick={() => {
                  void copyLink(ctxRowNode.url);
                  setCtxMenu(null);
                }}
              />
            </>
          )}
          {ctxRowNode.type === 'folder' && (
            <>
              <MenuItem
                icon={<ChevronLeft size={18} color={LABEL_SECONDARY} style={{ transform: 'scaleX(-1)' }} />}
                label="Open folder"
                onClick={() => {
                  navigateInto(ctxRowNode.id);
                  setCtxMenu(null);
                }}
              />
              {countDescendantBookmarks(ctxRowNode) > 0 && (
                <MenuItem
                  icon={<ExternalLink size={18} color={LABEL_SECONDARY} />}
                  label={`Open All (${countDescendantBookmarks(ctxRowNode)})`}
                  onClick={() => {
                    openAllInFolder(ctxRowNode);
                    setCtxMenu(null);
                  }}
                />
              )}
            </>
          )}
          <MenuItem
            icon={<Pencil size={18} color={LABEL_SECONDARY} />}
            label="Rename"
            onClick={() => {
              setModal({ kind: 'rename', nodeId: ctxRowNode.id });
              setCtxMenu(null);
            }}
          />
          <MenuItem
            icon={<FolderInput size={18} color={LABEL_SECONDARY} />}
            label="Move to…"
            onClick={() => {
              setModal({ kind: 'move', ids: [ctxRowNode.id] });
              setCtxMenu(null);
            }}
          />
          <div className="my-1 mx-3 h-px" style={{ background: 'rgba(255,255,255,0.10)' }} />
          <MenuItem
            icon={<Trash2 size={18} />}
            label="Delete"
            destructive
            onClick={() => {
              void deleteOne(ctxRowNode.id);
              setCtxMenu(null);
            }}
          />
        </ContextMenu>
      )}

      {ctxMenu?.kind === 'row' && ctxIsBulk && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
          {selectedBookmarkCount > 0 && (
            <MenuItem
              icon={<ExternalLink size={18} color={LABEL_SECONDARY} />}
              label={`Open ${selectedBookmarkCount} in new tab${selectedBookmarkCount === 1 ? '' : 's'}`}
              onClick={() => {
                openSelectedBookmarks();
                setCtxMenu(null);
              }}
            />
          )}
          <MenuItem
            icon={<FolderInput size={18} color={LABEL_SECONDARY} />}
            label={`Move ${selected.size} item${selected.size === 1 ? '' : 's'}…`}
            onClick={() => {
              setModal({ kind: 'move', ids: Array.from(selected) });
              setCtxMenu(null);
            }}
          />
          <MenuItem
            icon={<Trash2 size={18} />}
            label={`Delete ${selected.size} item${selected.size === 1 ? '' : 's'}`}
            destructive
            onClick={() => {
              void deleteSelected();
              setCtxMenu(null);
            }}
          />
        </ContextMenu>
      )}

      {ctxMenu?.kind === 'empty' && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
          <MenuItem
            icon={<Plus size={18} color={LABEL_SECONDARY} />}
            label="New bookmark"
            onClick={() => {
              setModal({ kind: 'add-bookmark' });
              setCtxMenu(null);
            }}
          />
          <MenuItem
            icon={<FolderPlus size={18} color={LABEL_SECONDARY} />}
            label="New folder"
            onClick={() => {
              setModal({ kind: 'add-folder' });
              setCtxMenu(null);
            }}
          />
        </ContextMenu>
      )}

      {modal?.kind === 'add-bookmark' && (
        <BookmarkModal onClose={() => setModal(null)} onSubmit={addBookmark} />
      )}
      {modal?.kind === 'add-folder' && (
        <FolderModal onClose={() => setModal(null)} onSubmit={addFolder} />
      )}
      {modal?.kind === 'rename' && renameNodeRef && (
        <RenameModal
          initialName={renameNodeRef.name}
          initialUrl={
            renameNodeRef.type === 'bookmark' ? renameNodeRef.url : undefined
          }
          kind={renameNodeRef.type}
          onClose={() => setModal(null)}
          onSubmit={async (data) =>
            renameNode(renameNodeRef.id, data.name, data.url)
          }
        />
      )}
      {modal?.kind === 'import' && (
        <ImportModal
          onClose={() => setModal(null)}
          onSubmit={async (treeIn) => importNow(treeIn)}
        />
      )}
      {modal?.kind === 'move' && (
        <MoveModal
          tree={tree}
          selectedIds={new Set(modal.ids)}
          currentParentId={currentFolder.id}
          onClose={() => setModal(null)}
          onMove={async (toFolderId) => moveItems(modal.ids, toFolderId)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
