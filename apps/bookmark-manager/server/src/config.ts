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

const encryptionKeyHex = required('ENCRYPTION_KEY');
if (!/^[0-9a-fA-F]{64}$/.test(encryptionKeyHex)) {
  throw new Error(
    'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32',
  );
}

// SETUP_CODE_HASH replaces the legacy ADMIN_PASSWORD_HASH; either name is accepted.
const setupCodeHash =
  process.env.SETUP_CODE_HASH || process.env.ADMIN_PASSWORD_HASH;
if (!setupCodeHash) {
  throw new Error('Missing required environment variable: SETUP_CODE_HASH');
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: Buffer.from(sessionSecretHex, 'hex'),
  encryptionKeyHex,
  setupCodeHash,
  ssoSecret: process.env.SSO_SESSION_SECRET ?? '',
  publicUrl: process.env.PUBLIC_URL ?? '',
  dataDir:
    process.env.DATA_DIR ??
    path.resolve(process.cwd(), 'data'),
  clientDist: path.resolve(process.cwd(), '../client/dist'),
};

export const isProd = config.nodeEnv === 'production';
