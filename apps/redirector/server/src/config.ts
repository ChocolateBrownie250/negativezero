import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const sessionSecretHex = required('SESSION_SECRET');
if (!/^[0-9a-fA-F]{64}$/.test(sessionSecretHex)) {
  throw new Error(
    'SESSION_SECRET must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32',
  );
}

const setupCodeHash = required('SETUP_CODE_HASH');

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: Buffer.from(sessionSecretHex, 'hex'),
  setupCodeHash,
  ssoSecret: process.env.SSO_SESSION_SECRET ?? '',
  // Admin's internal base URL for per-service authorization checks. Empty
  // disables the check (legacy "any valid SSO = full access") for incremental
  // rollout; docker-compose sets it to http://admin:3000.
  adminAuthzUrl: (process.env.ADMIN_AUTHZ_URL ?? '').replace(/\/+$/, ''),
  serviceName: 'redirector',
  publicUrl: process.env.PUBLIC_URL ?? '',
  dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'),
  clientDist: path.resolve(process.cwd(), '../client/dist'),
};

export const isProd = config.nodeEnv === 'production';
