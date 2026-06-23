import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
};

function contentType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function safeSourcePath(requested: string): string | null {
  const root = path.resolve(config.sourceImportsDir, 'isg-studio');
  const resolved = path.resolve(root, requested || 'ISG Studio.html');
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return resolved;
}

export default async function sourceRoutes(app: FastifyInstance) {
  app.get('/source/isg-studio/*', async (req, reply) => {
    const params = req.params as { '*': string };
    const filePath = safeSourcePath(params['*']);
    if (!filePath) return reply.code(400).send({ error: 'bad_source_path' });

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return reply.code(404).send({ error: 'not_found' });
      reply.type(contentType(filePath));
      return fs.readFile(filePath);
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
  });
}
