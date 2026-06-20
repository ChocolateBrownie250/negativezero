import 'dotenv/config';
import path from 'node:path';

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  // timezones has no local login of its own — auth is the apex-wide nz_session
  // SSO cookie minted by admin. Empty secret ⇒ SSO cookie auth fails closed.
  ssoSecret: process.env.SSO_SESSION_SECRET ?? '',
  // Admin's internal base URL for per-service authorization checks. Empty
  // disables the check (legacy "any valid SSO = full access") for incremental
  // rollout; docker-compose sets it to http://admin:3000.
  adminAuthzUrl: (process.env.ADMIN_AUTHZ_URL ?? '').replace(/\/+$/, ''),
  serviceName: 'timezones',
  publicUrl: process.env.PUBLIC_URL ?? '',
  dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'),
  // The static client shell (index.html, app.js, styles.css, fonts), served
  // publicly; the client gates itself on /api/v1/me. Sits at /app/public next
  // to /app/server in the image (../public from the server's cwd in dev too).
  staticDir: path.resolve(process.cwd(), '../public'),
};

export const isProd = config.nodeEnv === 'production';
