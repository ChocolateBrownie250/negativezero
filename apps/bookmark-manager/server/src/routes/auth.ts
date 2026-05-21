import bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';
import { config } from '../config.js';
import { db, type CredentialRow } from '../db.js';
import { generateBackupCode, normalizeCode } from '../lib/codes.js';
import {
  RP_ID,
  RP_NAME,
  RP_ORIGIN,
  RP_USER_ID,
  RP_USER_NAME,
} from '../lib/webauthn.js';

const RATE_LIMIT_LOGIN = {
  config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
};

declare module '@fastify/secure-session' {
  interface SessionData {
    userId?: 'owner';
    regChallenge?: string;
    regMode?: 'first' | 'reset' | 'authenticated';
    authChallenge?: string;
  }
}

function listCredentials(): CredentialRow[] {
  return db
    .prepare('SELECT * FROM credentials ORDER BY created_at ASC')
    .all() as CredentialRow[];
}

function credentialCount(): number {
  const r = db.prepare('SELECT COUNT(*) AS c FROM credentials').get() as { c: number };
  return r.c;
}

function getMeta(k: string): string | null {
  const r = db.prepare('SELECT v FROM auth_meta WHERE k = ?').get(k) as
    | { v: string }
    | undefined;
  return r?.v ?? null;
}

function setMeta(k: string, v: string): void {
  db.prepare(
    `INSERT INTO auth_meta (k, v, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`,
  ).run(k, v, Date.now());
}

async function isSetupCode(input: string): Promise<boolean> {
  if (!input) return false;
  return bcrypt.compare(input, config.setupCodeHash);
}

async function isBackupCode(input: string): Promise<boolean> {
  const stored = getMeta('backup_code_hash');
  if (!stored || !input) return false;
  return bcrypt.compare(normalizeCode(input), stored);
}

async function hashBackupCode(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export default async function authRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------
  app.get('/auth/me', async (req) => {
    return {
      authenticated: req.session.get('userId') === 'owner',
      hasPasskey: credentialCount() > 0,
    };
  });

  app.post('/auth/logout', async (req) => {
    req.session.delete();
    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // Registration: 3 entry conditions
  //   first  - no passkeys exist yet, body.setupCode validates
  //   reset  - passkeys exist, body.backupCode validates (will wipe on verify)
  //   auth   - already logged in, adding another device's passkey
  // ---------------------------------------------------------------------------
  app.post(
    '/auth/passkey/register/options',
    RATE_LIMIT_LOGIN,
    async (req, reply) => {
      const sessionAuth = req.session.get('userId') === 'owner';
      const body = (req.body ?? {}) as {
        setupCode?: unknown;
        backupCode?: unknown;
      };
      const hasAny = credentialCount() > 0;
      let mode: 'first' | 'reset' | 'authenticated' | null = null;

      if (sessionAuth) {
        mode = 'authenticated';
      } else if (
        !hasAny &&
        typeof body.setupCode === 'string' &&
        (await isSetupCode(body.setupCode))
      ) {
        mode = 'first';
      } else if (
        hasAny &&
        typeof body.backupCode === 'string' &&
        (await isBackupCode(body.backupCode))
      ) {
        mode = 'reset';
      }

      if (!mode) return reply.code(401).send({ error: 'unauthorized' });

      const existing = mode === 'reset' ? [] : listCredentials();
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: RP_USER_ID,
        userName: RP_USER_NAME,
        userDisplayName: 'Bookmarks',
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        excludeCredentials: existing.map((c) => ({
          id: c.id,
          transports: c.transports
            ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
            : undefined,
        })),
      });

      req.session.set('regChallenge', options.challenge);
      req.session.set('regMode', mode);
      return options;
    },
  );

  app.post(
    '/auth/passkey/register/verify',
    RATE_LIMIT_LOGIN,
    async (req, reply) => {
      const challenge = req.session.get('regChallenge');
      const mode = req.session.get('regMode');
      if (!challenge || !mode) {
        return reply.code(400).send({ error: 'no_challenge' });
      }

      const body = (req.body ?? {}) as {
        response?: RegistrationResponseJSON;
        deviceName?: unknown;
      };
      if (!body.response) {
        return reply.code(400).send({ error: 'missing_response' });
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: body.response,
          expectedChallenge: challenge,
          expectedOrigin: RP_ORIGIN,
          expectedRPID: RP_ID,
          requireUserVerification: false,
        });
      } catch (err) {
        app.log.warn({ err }, 'passkey registration verification failed');
        return reply.code(400).send({ error: 'verification_failed' });
      }

      if (!verification.verified || !verification.registrationInfo) {
        return reply.code(400).send({ error: 'verification_failed' });
      }

      const { credential } = verification.registrationInfo;
      const credId = credential.id;
      const publicKey = Buffer.from(credential.publicKey);
      const counter = credential.counter ?? 0;
      const transports = body.response.response?.transports
        ? JSON.stringify(body.response.response.transports)
        : null;
      const deviceName =
        typeof body.deviceName === 'string' && body.deviceName.trim()
          ? body.deviceName.trim().slice(0, 64)
          : null;

      const issueBackupCode = mode === 'first' || mode === 'reset';
      const newBackupPlain = issueBackupCode ? generateBackupCode() : null;
      const newBackupHash = newBackupPlain ? await hashBackupCode(newBackupPlain) : null;

      const tx = db.transaction(() => {
        if (mode === 'reset') {
          db.prepare('DELETE FROM credentials').run();
        }
        db.prepare(
          `INSERT OR REPLACE INTO credentials
             (id, public_key, counter, transports, device_name, created_at, last_used)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(credId, publicKey, counter, transports, deviceName, Date.now(), null);
        if (newBackupHash) {
          setMeta('backup_code_hash', newBackupHash);
        }
      });
      tx();

      req.session.set('regChallenge', undefined);
      req.session.set('regMode', undefined);
      req.session.set('userId', 'owner');

      return {
        ok: true,
        backupCode: newBackupPlain, // only present on first/reset; null when adding a device
      };
    },
  );

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------
  app.post(
    '/auth/passkey/login/options',
    RATE_LIMIT_LOGIN,
    async (req) => {
      const creds = listCredentials();
      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: 'preferred',
        allowCredentials: creds.map((c) => ({
          id: c.id,
          transports: c.transports
            ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
            : undefined,
        })),
      });
      req.session.set('authChallenge', options.challenge);
      return options;
    },
  );

  app.post(
    '/auth/passkey/login/verify',
    RATE_LIMIT_LOGIN,
    async (req, reply) => {
      const body = (req.body ?? {}) as { response?: AuthenticationResponseJSON };
      if (!body.response) {
        return reply.code(400).send({ error: 'missing_response' });
      }

      const challenge = req.session.get('authChallenge');
      if (!challenge) return reply.code(400).send({ error: 'no_challenge' });

      const credId = body.response.id;
      const row = db
        .prepare('SELECT * FROM credentials WHERE id = ?')
        .get(credId) as CredentialRow | undefined;
      if (!row) return reply.code(401).send({ error: 'unknown_credential' });

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: body.response,
          expectedChallenge: challenge,
          expectedOrigin: RP_ORIGIN,
          expectedRPID: RP_ID,
          credential: {
            id: row.id,
            publicKey: new Uint8Array(row.public_key),
            counter: row.counter,
            transports: row.transports
              ? (JSON.parse(row.transports) as AuthenticatorTransportFuture[])
              : undefined,
          },
          requireUserVerification: false,
        });
      } catch (err) {
        app.log.warn({ err }, 'passkey login verification failed');
        return reply.code(401).send({ error: 'verification_failed' });
      }

      if (!verification.verified) {
        return reply.code(401).send({ error: 'verification_failed' });
      }

      db.prepare(
        'UPDATE credentials SET counter = ?, last_used = ? WHERE id = ?',
      ).run(verification.authenticationInfo.newCounter, Date.now(), row.id);

      req.session.set('authChallenge', undefined);
      req.session.set('userId', 'owner');
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------------------
  // Manage passkeys (auth required)
  // ---------------------------------------------------------------------------
  app.get('/auth/passkey/list', async (req, reply) => {
    if (req.session.get('userId') !== 'owner') {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const creds = listCredentials();
    return {
      credentials: creds.map((c) => ({
        id: c.id,
        deviceName: c.device_name,
        createdAt: c.created_at,
        lastUsed: c.last_used,
      })),
    };
  });

  app.delete('/auth/passkey/:id', async (req, reply) => {
    if (req.session.get('userId') !== 'owner') {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { id } = req.params as { id: string };
    db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
    return { ok: true };
  });

  // Generate a fresh backup code (auth required)
  app.post('/auth/backup-code/rotate', async (req, reply) => {
    if (req.session.get('userId') !== 'owner') {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const code = generateBackupCode();
    setMeta('backup_code_hash', await hashBackupCode(code));
    return { backupCode: code };
  });
}
