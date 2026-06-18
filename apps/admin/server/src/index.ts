import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { config, isProd } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { ensureOwnerAccount } from './lib/accounts.js';
import authRoutes from './routes/auth.js';
import codeRoutes from './routes/codes.js';
import accountRoutes from './routes/accounts.js';
import internalRoutes from './routes/internal.js';

async function main() {
  const app = Fastify({
    logger: {
      level: isProd ? 'info' : 'debug',
      redact: ['req.headers.cookie', 'req.headers.authorization'],
    },
    trustProxy: true,
  });

  await app.register(rateLimit, { global: false });

  // Register @fastify/cookie before secure-session so routes can read/set the
  // apex-wide nz_session SSO cookie via reply.setCookie / req.cookies.
  await app.register(fastifyCookie);

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

  // Seed the owner account / adopt legacy single-owner passkeys.
  ensureOwnerAccount();

  app.register(authRoutes, { prefix: '/api' });

  // Service-to-service authorization endpoint. Bearer-guarded inside the
  // handler; never exposed through nginx. NOT behind requireAuth.
  app.register(internalRoutes, { prefix: '/api' });

  app.register(
    async (instance) => {
      instance.addHook('onRequest', requireAuth);
      instance.register(codeRoutes);
      instance.register(accountRoutes);
    },
    { prefix: '/api' },
  );

  if (fs.existsSync(config.clientDist)) {
    await app.register(fastifyStatic, {
      root: config.clientDist,
      prefix: '/',
      wildcard: false,
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

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
