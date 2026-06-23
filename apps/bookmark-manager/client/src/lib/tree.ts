export type NodeType = 'folder' | 'bookmark';

// A custom node icon: exactly one of `emoji` or `lucide` (a name from the
// client's fixed icon set in lib/nodeIcons), shown on the `bg` background.
export interface NodeIcon {
  emoji?: string;
  lucide?: string;
  bg: string;
}

export interface FolderNode {
  id: string;
  parentId: string | null;
  type: 'folder';
  name: string;
  icon: NodeIcon | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface BookmarkNode {
  id: string;
  parentId: string;
  type: 'bookmark';
  name: string;
  url: string;
  faviconUrl: string | null;
  icon: NodeIcon | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export type ApiNode = FolderNode | BookmarkNode;

export interface TreeFolder extends FolderNode {
  children: TreeNode[];
}
export type TreeNode = TreeFolder | BookmarkNode;

export function buildTree(nodes: ApiNode[]): TreeFolder {
  const byId = new Map<string, ApiNode>();
  const childrenOf = new Map<string, ApiNode[]>();
  for (const n of nodes) byId.set(n.id, n);
  for (const n of nodes) {
    if (n.id === 'root') continue;
    const pid = n.parentId ?? 'root';
    const arr = childrenOf.get(pid) ?? [];
    arr.push(n);
    childrenOf.set(pid, arr);
  }
  function make(id: string): TreeFolder {
    const f = byId.get(id);
    if (!f || f.type !== 'folder') {
      // root may be missing if API hasn't returned it; synthesize
      const synth: TreeFolder = {
        id: 'root',
        parentId: null,
        type: 'folder',
        name: 'Bookmarks',
        icon: null,
        position: 0,
        createdAt: 0,
        updatedAt: 0,
        children: [],
      };
      const kids = (childrenOf.get(id) ?? []).slice().sort((a, b) => a.position - b.position);
      synth.children = kids.map((k) => (k.type === 'folder' ? make(k.id) : { ...k }));
      return synth;
    }
    const kids = (childrenOf.get(id) ?? []).slice().sort((a, b) => a.position - b.position);
    return {
      ...f,
      children: kids.map((k) => (k.type === 'folder' ? make(k.id) : { ...k })),
    };
  }
  return make('root');
}

export function findFolder(tree: TreeFolder, id: string): TreeFolder | null {
  if (tree.id === id) return tree;
  for (const c of tree.children) {
    if (c.type === 'folder') {
      const r = findFolder(c, id);
      if (r) return r;
    }
  }
  return null;
}

export function countItems(folder: TreeFolder): number {
  return folder.children.length;
}

export function countDescendantBookmarks(folder: TreeFolder): number {
  let n = 0;
  for (const c of folder.children) {
    if (c.type === 'bookmark') n += 1;
    else n += countDescendantBookmarks(c);
  }
  return n;
}

export function collectBookmarkUrls(folder: TreeFolder): string[] {
  const out: string[] = [];
  function walk(node: TreeNode) {
    if (node.type === 'bookmark') out.push(node.url);
    else node.children.forEach(walk);
  }
  walk(folder);
  return out;
}

export function collectBookmarkItems(folder: TreeFolder): Array<{ name: string; url: string }> {
  const out: Array<{ name: string; url: string }> = [];
  function walk(node: TreeNode) {
    if (node.type === 'bookmark') out.push({ name: node.name, url: node.url });
    else node.children.forEach(walk);
  }
  walk(folder);
  return out;
}
