import type { FastifyInstance } from 'fastify';
import { fetchMetadata, BlockedTargetError, normalizeUrl } from '../lib/fetcher.js';

export default async function metadataRoutes(app: FastifyInstance) {
  app.post('/metadata/fetch', async (req, reply) => {
    const body = req.body as { url?: unknown } | null;
    const raw = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!raw) return reply.code(400).send({ error: 'invalid_url' });
    let normalized: string;
    try {
      normalized = normalizeUrl(raw);
      const u = new URL(normalized);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return reply.code(400).send({ error: 'invalid_url' });
      }
    } catch {
      return reply.code(400).send({ error: 'invalid_url' });
    }
    try {
      const meta = await fetchMetadata(normalized);
      return {
        url: meta.url,
        finalUrl: meta.finalUrl,
        title: meta.title,
        faviconUrl: meta.faviconUrl,
      };
    } catch (err) {
      if (err instanceof BlockedTargetError) {
        return reply.code(400).send({ error: 'blocked_target' });
      }
      return reply.code(400).send({ error: 'invalid_url' });
    }
  });
}
