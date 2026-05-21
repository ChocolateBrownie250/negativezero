import type { FastifyInstance } from 'fastify';
import { db, rowToApi, type ApiNode, type DbNodeRow } from '../db.js';
import { buildTree, type TreeFolder, type TreeNode } from '../lib/tree.js';
import { newId } from '../lib/ids.js';
import { encryptString, encryptNullable } from '../lib/crypto.js';

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
      if (!body || !isImportRoot(body.tree)) {
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
        children.forEach((child, idx) => {
          const id = newId();
          if (child.type === 'folder') {
            insert.run(
              id,
              parentId,
              'folder',
              encryptString(child.name),
              null,
              null,
              idx,
              now,
              now,
            );
            count += 1;
            insertChildren(child.children, id);
          } else {
            insert.run(
              id,
              parentId,
              'bookmark',
              encryptString(child.name),
              encryptString(child.url),
              encryptNullable(child.faviconUrl ?? null),
              idx,
              now,
              now,
            );
            count += 1;
          }
        });
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
