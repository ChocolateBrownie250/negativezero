import type { FastifyInstance } from 'fastify';
import { db, rowToApi, type ApiNode, type DbNodeRow } from '../db.js';
import { buildTree, type TreeFolder, type TreeNode } from '../lib/tree.js';
import { newId } from '../lib/ids.js';
import { normalizeUrl } from '../lib/fetcher.js';
import { encryptString, encryptNullable } from '../lib/crypto.js';

// Bound the import so a malicious / corrupt file can't exhaust the stack
// (deeply nested folders) or the database (huge node count). These limits
// are generous for real bookmark exports but cut off resource-exhaustion DoS.
const MAX_IMPORT_DEPTH = 32;
const MAX_IMPORT_NODES = 10000;

// Validate an imported bookmark URL with exactly the same normalize + scheme
// guard the interactive create path (routes/nodes.ts) enforces, so the import
// endpoint can't be used to smuggle a stored javascript:/data: URL past the
// http(s)-only rule (stored XSS). Returns the normalized URL, or null if the
// URL is malformed or uses a disallowed scheme.
function safeImportUrl(raw: string): string | null {
  try {
    const normalized = normalizeUrl(raw);
    const u = new URL(normalized);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return normalized;
  } catch {
    return null;
  }
}

type ImportFolder = {
  type: 'folder';
  name: string;
  children?: ImportNode[];
};
type ImportBookmark = {
  type: 'bookmark';
  name: string;
  url: string;
  faviconUrl?: string | null;
};
type ImportNode = ImportFolder | ImportBookmark;

// Iteratively (no recursion) walk the raw parsed tree to enforce the depth
// and node-count caps BEFORE the recursive shape validators run. The shape
// validators themselves recurse via Array.every, so a deeply-nested payload
// would overflow the stack there; this guard rejects such input first.
// Returns null if within limits, or an error code otherwise.
function checkImportLimits(root: unknown): null | 'tree_too_deep' | 'tree_too_large' {
  let count = 0;
  // Stack of [node, depth]. Root folder is depth 0.
  const stack: Array<[unknown, number]> = [[root, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (depth > MAX_IMPORT_DEPTH) return 'tree_too_deep';
    if (!node || typeof node !== 'object') continue;
    count += 1;
    if (count > MAX_IMPORT_NODES) return 'tree_too_large';
    const children = (node as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const child of children) {
        stack.push([child, depth + 1]);
      }
    }
  }
  return null;
}

function isImportNode(v: unknown): v is ImportNode {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.type === 'folder') {
    if (typeof o.name !== 'string') return false;
    if (o.children !== undefined) {
      if (!Array.isArray(o.children)) return false;
      return o.children.every(isImportNode);
    }
    return true;
  }
  if (o.type === 'bookmark') {
    if (typeof o.name !== 'string' || typeof o.url !== 'string') return false;
    if (o.faviconUrl !== undefined && o.faviconUrl !== null && typeof o.faviconUrl !== 'string') {
      return false;
    }
    return true;
  }
  return false;
}

function isImportRoot(v: unknown): v is ImportFolder {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.type !== 'folder') return false;
  if (typeof o.name !== 'string') return false;
  if (o.children !== undefined && !Array.isArray(o.children)) return false;
  if (Array.isArray(o.children) && !o.children.every(isImportNode)) return false;
  return true;
}

function exportTreeShape(tree: TreeFolder): unknown {
  function shape(node: TreeNode): unknown {
    if (node.type === 'folder') {
      return {
        id: node.id,
        type: 'folder',
        name: node.name,
        children: node.children.map(shape),
      };
    }
    return {
      id: node.id,
      type: 'bookmark',
      name: node.name,
      url: node.url,
      faviconUrl: node.faviconUrl ?? null,
    };
  }
  return shape(tree);
}

export default async function transferRoutes(app: FastifyInstance) {
  app.get('/export', async (_req, reply) => {
    const rows = db
      .prepare('SELECT * FROM nodes ORDER BY parent_id, position')
      .all() as DbNodeRow[];
    const flat: ApiNode[] = rows.map(rowToApi);
    const tree = buildTree(flat);
    const shaped = exportTreeShape(tree);
    const date = new Date().toISOString().slice(0, 10);
    reply
      .header('content-type', 'application/json')
      .header('content-disposition', `attachment; filename="bookmarks-${date}.json"`);
    return shaped;
  });

  app.post(
    '/import',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { tree?: unknown; mode?: unknown } | null;
      if (!body || body.tree == null) {
        return reply.code(400).send({ error: 'invalid_tree' });
      }
      // Enforce depth / count caps BEFORE the recursive shape validation so an
      // over-deep payload can't overflow the stack inside isImportRoot.
      const limitError = checkImportLimits(body.tree);
      if (limitError) {
        return reply.code(400).send({ error: limitError });
      }
      if (!isImportRoot(body.tree)) {
        return reply.code(400).send({ error: 'invalid_tree' });
      }
      const root = body.tree;

      const now = Date.now();
      let count = 0;

      const insert = db.prepare(
        `INSERT INTO nodes (id, parent_id, type, name, url, favicon_url, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      function insertChildren(children: ImportNode[] | undefined, parentId: string) {
        if (!children) return;
        // Track position separately from the source index so that skipped
        // (invalid-URL) bookmarks don't leave gaps in sibling positions.
        let pos = 0;
        for (const child of children) {
          const id = newId();
          if (child.type === 'folder') {
            insert.run(
              id,
              parentId,
              'folder',
              encryptString(child.name),
              null,
              null,
              pos,
              now,
              now,
            );
            pos += 1;
            count += 1;
            insertChildren(child.children, id);
          } else {
            // Apply the same http(s)-only scheme guard as the create path.
            // A bookmark with a javascript:/data:/file: (or otherwise
            // malformed) URL is skipped rather than stored — this is what
            // closes the stored-XSS-via-import hole.
            const safeUrl = safeImportUrl(child.url);
            if (!safeUrl) continue;
            insert.run(
              id,
              parentId,
              'bookmark',
              encryptString(child.name),
              encryptString(safeUrl),
              encryptNullable(child.faviconUrl ?? null),
              pos,
              now,
              now,
            );
            pos += 1;
            count += 1;
          }
        }
      }

      const tx = db.transaction(() => {
        // delete all rows except root
        db.prepare("DELETE FROM nodes WHERE id != 'root'").run();
        // keep root row, but update timestamp
        db.prepare('UPDATE nodes SET updated_at = ? WHERE id = ?').run(now, 'root');
        insertChildren(root.children, 'root');
      });
      tx();

      return { ok: true, count };
    },
  );
}
