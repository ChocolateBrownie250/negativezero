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

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: Buffer.from(sessionSecretHex, 'hex'),
  setupCodeHash,
  publicUrl: process.env.PUBLIC_URL ?? '',
  dataDir:
    process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'),
  clientDist: path.resolve(process.cwd(), '../client/dist'),
  maxSegments: numberEnv('VIDEO_DOWNLOADER_MAX_SEGMENTS', 1_000),
  maxBytes: numberEnv('VIDEO_DOWNLOADER_MAX_BYTES', 2_000_000_000),
  concurrency: numberEnv('VIDEO_DOWNLOADER_CONCURRENCY', 4),
  jobTimeoutMs: numberEnv('VIDEO_DOWNLOADER_JOB_TIMEOUT_MS', 10 * 60 * 1000),
};

export const isProd = config.nodeEnv === 'production';
