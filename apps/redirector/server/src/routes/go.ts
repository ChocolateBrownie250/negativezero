import type { FastifyInstance } from 'fastify';
import { db, type RedirectRow } from '../db.js';
import { normalizeSlug, SLUG_PATTERN } from '../lib/redirects.js';

// Public redirect endpoint. No auth: the whole point is a shareable link.
// The hash lives directly under the service root —
// negativezero.one/services/redirector/<hash> — which nginx prefix-strips to
// /<hash>. The route param is regex-constrained to the exact 16-char hash
// shape so it can never shadow the SPA ('/'), the API ('/api/...'), or a
// static asset ('/assets/...'). Rate-limited to blunt hash-enumeration.
export default async function goRoutes(app: FastifyInstance) {
  app.get(
    `/:slug(${SLUG_PATTERN})`,
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const row = db
        .prepare('SELECT * FROM redirects WHERE slug = ?')
        .get(normalizeSlug(slug)) as RedirectRow | undefined;

      if (!row) {
        return reply.code(404).type('text/html').send(notFoundPage(slug));
      }

      db.prepare(
        'UPDATE redirects SET hits = hits + 1, last_used_at = ? WHERE id = ?',
      ).run(Date.now(), row.id);

      // 302: targets are editable, so the redirect must not be cached as
      // permanent by browsers/proxies.
      return reply.code(302).header('location', row.target).send();
    },
  );
}

function notFoundPage(slug: string): string {
  const safe = slug.replace(/[<>&"]/g, '');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>No such link</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0a0a0d;color:#f5f5f7;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
  .card{text-align:center;padding:2rem}
  code{color:#0a84ff}
  p{color:#86868b}
</style></head>
<body><div class="card">
  <h1>No such link</h1>
  <p>No redirect is configured for <code>${safe}</code>.</p>
</div></body></html>`;
}
