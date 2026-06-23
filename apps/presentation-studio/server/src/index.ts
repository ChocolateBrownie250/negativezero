import Fastify from 'fastify';
import secureSession from '@fastify/secure-session';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, isProd } from './config.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import presentationRoutes from './routes/presentation.js';
import sourceRoutes from './routes/source.js';

export async function createApp() {
  const app = Fastify({
    logger: {
      level: isProd ? 'info' : 'debug',
      redact: ['req.headers.cookie', 'req.headers.authorization'],
    },
    trustProxy: true,
  });

  await app.register(rateLimit, { global: false });

  // Cookie path is derived from PUBLIC_URL's pathname so the session
  // cookie isn't sent to neighbouring services under the same apex.
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
      maxAge: 60 * 60 * 24 * 30,
    },
  });

  app.get('/api/health', async () => ({ ok: true }));

  app.register(authRoutes, { prefix: '/api' });

  app.register(
    async (instance) => {
      instance.addHook('onRequest', requireAuth);
      instance.register(presentationRoutes);
      instance.register(sourceRoutes);
    },
    { prefix: '/api' },
  );

  // The HTML shell + manifest must revalidate every load, or a deploy's new
  // hashed asset refs stay pinned for up to the static maxAge. Hashed /assets/*
  // keep the long cache. Matches the platform convention used across services.
  app.addHook('onSend', async (req, reply, payload) => {
    const ct = String(reply.getHeader('content-type') || '');
    if (ct.includes('text/html') || req.url.split('?')[0].endsWith('.webmanifest')) {
      reply.header('cache-control', 'no-cache, must-revalidate');
    }
    return payload;
  });

  if (fs.existsSync(config.clientDist)) {
    app.get('/sw.js', async (_req, reply) => {
      const swPath = path.join(config.clientDist, 'sw.js');
      if (!fs.existsSync(swPath)) {
        reply.code(404);
        return { error: 'not_found' };
      }
      reply
        .header('cache-control', 'no-cache, no-store, must-revalidate')
        .header('service-worker-allowed', cookiePath)
        .type('application/javascript; charset=utf-8');
      return fs.readFileSync(swPath, 'utf8');
    });

    await app.register(fastifyStatic, {
      root: config.clientDist,
      prefix: '/',
      cacheControl: true,
      maxAge: '1h',
    });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        const indexPath = path.join(config.clientDist, 'index.html');
        if (fs.existsSync(indexPath)) {
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

  return app;
}

async function main() {
  const app = await createApp();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  main();
}
