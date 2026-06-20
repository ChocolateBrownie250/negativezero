import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, isProd } from './config.js';
import { requireAuth } from './middleware/auth.js';
import meRoutes from './routes/me.js';
import presetRoutes from './routes/presets.js';

export async function createApp() {
  const app = Fastify({
    logger: {
      level: isProd ? 'info' : 'debug',
      redact: ['req.headers.cookie', 'req.headers.authorization'],
    },
    trustProxy: true,
  });

  app.get('/api/health', async () => ({ ok: true }));

  // Gated API: /api/v1/me (boot gate) + /api/presets (per-account CRUD). Auth is
  // the apex nz_session SSO cookie + admin authz; there is no local login.
  app.register(
    async (instance) => {
      instance.addHook('onRequest', requireAuth);
      instance.register(meRoutes);
      instance.register(presetRoutes);
    },
    { prefix: '/api' },
  );

  // The static client shell is served publicly; app.js calls /api/v1/me on load
  // and bounces anonymous visitors to the admin hub (same pattern as the
  // Amethyst PWA). Nothing sensitive lives in the shell.
  if (fs.existsSync(config.staticDir)) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: '/',
      wildcard: false,
      cacheControl: true,
      maxAge: '1h',
    });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        const indexPath = path.join(config.staticDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          reply.type('text/html');
          return fs.readFileSync(indexPath, 'utf8');
        }
      }
      reply.code(404).send({ error: 'not_found' });
    });
  } else {
    app.log.warn({ staticDir: config.staticDir }, 'static client dir not found - api-only mode');
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
