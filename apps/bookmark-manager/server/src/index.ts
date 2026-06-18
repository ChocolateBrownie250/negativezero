import Fastify from 'fastify';
import secureSession from '@fastify/secure-session';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { config, isProd } from './config.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import nodeRoutes from './routes/nodes.js';
import metadataRoutes from './routes/metadata.js';
import transferRoutes from './routes/transfer.js';

async function main() {
  const app = Fastify({
    logger: {
      level: isProd ? 'info' : 'debug',
      redact: ['req.headers.cookie', 'req.headers.authorization'],
    },
    trustProxy: true,
  });

  await app.register(rateLimit, {
    global: false,
  });

  // Cookie path is derived from PUBLIC_URL's pathname so when the app is
  // mounted under e.g. /services/bookmark-manager/ on a shared apex, the session
  // cookie isn't sent to neighbouring tenants (Amethyst, ISG, WellFit)
  // on the same domain. Falls back to '/' for plain-domain deployments.
  let cookiePath = '/';
  if (config.publicUrl) {
    try {
      const p = new URL(config.publicUrl).pathname;
      if (p && p !== '/') cookiePath = p.endsWith('/') ? p : p + '/';
    } catch {
      // keep default
    }
  }
  await app.register(secureSession, {
    key: config.sessionSecret,
    cookieName: 'session',
    cookie: {
      path: cookiePath,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  });

  app.get('/api/health', async () => ({ ok: true }));

  // public auth routes
  app.register(authRoutes, { prefix: '/api' });

  // protected api routes
  app.register(
    async (instance) => {
      instance.addHook('onRequest', requireAuth);
      instance.register(nodeRoutes);
      instance.register(metadataRoutes);
      instance.register(transferRoutes);
    },
    { prefix: '/api' },
  );

  // static client
  if (fs.existsSync(config.clientDist)) {
    // The HTML shell + manifest must revalidate every load, or a deploy's new
    // hashed asset refs stay pinned for up to maxAge (the bundle is cache-busted
    // by filename hash; this entry document is not). @fastify/static's `maxAge`
    // wins over its own `setHeaders`, so override at the onSend layer instead —
    // hashed /assets/* (js/css) keep the long cache since they're immutable.
    app.addHook('onSend', async (req, reply, payload) => {
      const ct = String(reply.getHeader('content-type') || '');
      if (ct.includes('text/html') || req.url.split('?')[0].endsWith('.webmanifest')) {
        reply.header('Cache-Control', 'no-cache, must-revalidate');
      }
      return payload;
    });
    await app.register(fastifyStatic, {
      root: config.clientDist,
      prefix: '/',
      wildcard: false,
      cacheControl: true,
      maxAge: '1h',
    });
    // SPA fallback: any non-/api GET -> index.html
    app.setNotFoundHandler(async (req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        const indexPath = path.join(config.clientDist, 'index.html');
        if (fs.existsSync(indexPath)) {
          // index.html must never be cached: the SPA bundle is cache-busted by
          // filename hash, but this entry document is not — caching it pins the
          // OLD asset hashes, so a fresh deploy stays invisible until the static
          // maxAge (1h) expires. no-cache forces a revalidation every load.
          reply.header('Cache-Control', 'no-cache, must-revalidate');
          reply.type('text/html');
          return fs.readFileSync(indexPath, 'utf8');
        }
      }
      reply.code(404).send({ error: 'not_found' });
    });
  } else {
    app.log.info(
      { clientDist: config.clientDist },
      'client dist not found - api-only mode (run npm -w client run build)',
    );
  }

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
