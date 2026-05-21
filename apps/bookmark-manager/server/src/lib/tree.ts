import type { ApiNode } from '../db.js';

export type TreeFolder = Extract<ApiNode, { type: 'folder' }> & { children: TreeNode[] };
export type TreeBookmark = Extract<ApiNode, { type: 'bookmark' }>;
export type TreeNode = TreeFolder | TreeBookmark;

export function buildTree(nodes: ApiNode[]): TreeFolder {
  const byId = new Map<string, ApiNode>();
  const children = new Map<string, ApiNode[]>();
  for (const n of nodes) byId.set(n.id, n);
  for (const n of nodes) {
    if (n.id === 'root') continue;
    const pid = n.parentId ?? 'root';
    const arr = children.get(pid) ?? [];
    arr.push(n);
    children.set(pid, arr);
  }

  function makeFolder(id: string): TreeFolder {
    const f = byId.get(id);
    if (!f || f.type !== 'folder') throw new Error('expected folder');
    const kids = (children.get(id) ?? []).slice().sort((a, b) => a.position - b.position);
    return {
      ...f,
      children: kids.map((k) => (k.type === 'folder' ? makeFolder(k.id) : { ...k })),
    };
  }

  return makeFolder('root');
}
