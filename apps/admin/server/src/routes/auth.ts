import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
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
} from '@simplewebauthn/server';
import { config, isProd } from '../config.js';
import { db, type CredentialRow } from '../db.js';
import { generateRegistrationCode, normalizeCode } from '../lib/codes.js';
import {
  mintSsoSession,
  readSsoCookie,
  verifySsoSession,
  SSO_MAX_AGE_S,
} from '../lib/ssoSession.js';
import {
  OWNER_ACCOUNT_ID,
  createAccount,
  ensureOwnerAccount,
  getAccount,
  isAllowed,
  isGatedService,
  listAccounts,
} from '../lib/accounts.js';
import { resolveAccount } from '../middleware/auth.js';
import { RP_ID, RP_NAME, RP_ORIGIN } from '../lib/webauthn.js';

const RATE_LIMIT_LOGIN = {
  config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
};

// Global (IP-independent) lockout for setup-code attempts. After this many
// failed attempts, code-based enrollment is disabled until a success.
const SETUP_FAILED_LIMIT = 10;
const SETUP_FAILED_KEY = 'setup_failed_count';

function audit(req: FastifyRequest, event: string, detail?: string): void {
  try {
    db.prepare(
      'INSERT INTO audit_log (ts, event, detail, ip) VALUES (?, ?, ?, ?)',
    ).run(Date.now(), event, detail ?? null, req.ip ?? null);
  } catch {
    // Auditing must never break the request flow.
  }
}

function getSetupFailedCount(): number {
  const v = getMeta(SETUP_FAILED_KEY);
  const n = v ? Number.parseInt(v, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function bumpSetupFailedCount(): number {
  const next = getSetupFailedCount() + 1;
  setMeta(SETUP_FAILED_KEY, String(next));
  return next;
}

function resetSetupFailedCount(): void {
  setMeta(SETUP_FAILED_KEY, '0');
}

function listCredentials(accountId?: string): CredentialRow[] {
  if (accountId) {
    return db
      .prepare('SELECT * FROM credentials WHERE account_id = ? ORDER BY created_at ASC')
      .all(accountId) as CredentialRow[];
  }
  return db
    .prepare('SELECT * FROM credentials ORDER BY created_at ASC')
    .all() as CredentialRow[];
}

function credentialCount(): number {
  const r = db.prepare('SELECT COUNT(*) AS c FROM credentials').get() as { c: number };
  return r.c;
}

function ownerExists(): boolean {
  return getAccount(OWNER_ACCOUNT_ID) !== undefined && credentialCount() > 0;
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

async function isEnvSetupCode(input: string): Promise<boolean> {
  if (!input) return false;
  return bcrypt.compare(input, config.setupCodeHash);
}

async function isBackupCode(input: string): Promise<boolean> {
  const stored = getMeta('backup_code_hash');
  if (!stored || !input) return false;
  return bcrypt.compare(normalizeCode(input), stored);
}

async function hashBackupCode(plain: string): Promise<string> {
  return bcrypt.hash(normalizeCode(plain), 12);
}

// Re-insert hyphens every 4 chars so a user who typed the code without them
// still matches the stored (hyphenated) hash.
function hyphenate(normalized: string): string {
  return normalized.match(/.{1,4}/g)?.join('-') ?? normalized;
}

type CodeMatch = { id: string; services: string[]; name: string | null };

// Find an unused setup code matching the user's input (hyphenated or not).
async function findUnusedCode(plain: string): Promise<CodeMatch | null> {
  if (!plain) return null;
  const candidates = [plain.trim(), hyphenate(normalizeCode(plain))];
  const rows = db
    .prepare(
      `SELECT id, code_hash, granted_services, name, service
         FROM generated_codes
        WHERE used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 200`,
    )
    .all() as {
    id: string;
    code_hash: string;
    granted_services: string | null;
    name: string | null;
    service: string;
  }[];
  for (const r of rows) {
    for (const cand of candidates) {
      if (await bcrypt.compare(cand, r.code_hash)) {
        const services = r.granted_services
          ? (JSON.parse(r.granted_services) as string[]).filter(isGatedService)
          : [r.service].filter(isGatedService);
        return { id: r.id, services, name: r.name };
      }
    }
  }
  return null;
}

// Atomically claim a single-use code. Returns false if it was already used
// (e.g. two browsers raced the same code), so the caller can abort.
function markCodeUsed(codeId: string, accountId: string): boolean {
  const res = db
    .prepare(
      'UPDATE generated_codes SET used_at = ?, account_id = ? WHERE id = ? AND used_at IS NULL',
    )
    .run(Date.now(), accountId, codeId);
  return res.changes > 0;
}

// Thrown inside the registration transaction to roll back a raced enrollment.
class CodeAlreadyUsedError extends Error {}

export default async function authRoutes(app: FastifyInstance) {
  app.get('/auth/me', async (req) => {
    const accountId = await resolveAccount(req);
    const acct = accountId ? getAccount(accountId) : undefined;
    const authenticated = !!acct && acct.status === 'active';
    return {
      authenticated,
      hasPasskey: credentialCount() > 0,
      isOwner: acct?.is_owner === 1,
      name: acct?.name ?? null,
      // Only the owner (or an admin-granted account) manages the platform.
      canAdmin: authenticated && isAllowed(accountId!, 'admin'),
    };
  });

  app.post('/auth/logout', async (req, reply) => {
    req.session.delete();
    reply.clearCookie('nz_session', { path: '/' });
    return { ok: true };
  });

  app.post(
    '/auth/passkey/register/options',
    RATE_LIMIT_LOGIN,
    async (req, reply) => {
      const sessionAccountId = await resolveAccount(req);
      const body = (req.body ?? {}) as {
        setupCode?: unknown;
        backupCode?: unknown;
        name?: unknown;
      };

      let mode: 'first' | 'reset' | 'authenticated' | 'enroll' | null = null;
      let regAccountId = '';
      let regAccountName = '';
      let regServices: string[] = [];
      let regCodeId = '';

      if (sessionAccountId && getAccount(sessionAccountId)) {
        // Logged in → add another passkey to the same account.
        mode = 'authenticated';
        regAccountId = sessionAccountId;
        regAccountName = getAccount(sessionAccountId)!.name;
      } else if (typeof body.setupCode === 'string' && body.setupCode.trim()) {
        // Validity is checked BEFORE the failed-attempt counter, so a genuine
        // invite code is never deadlocked by prior bad attempts. The counter
        // only throttles *invalid* tries (the else branch), and a successful
        // match clears it.
        if (!ownerExists() && (await isEnvSetupCode(body.setupCode))) {
          // First-ever enrollment bootstraps the owner account.
          mode = 'first';
          regAccountId = OWNER_ACCOUNT_ID;
          regAccountName =
            typeof body.name === 'string' && body.name.trim()
              ? body.name.trim().slice(0, 80)
              : 'Owner';
          resetSetupFailedCount();
        } else {
          const match = await findUnusedCode(body.setupCode);
          if (match) {
            mode = 'enroll';
            regAccountId = randomUUID();
            regAccountName =
              match.name ||
              (typeof body.name === 'string' && body.name.trim()
                ? body.name.trim().slice(0, 80)
                : 'Member');
            regServices = match.services;
            regCodeId = match.id;
            resetSetupFailedCount();
          } else {
            const n = bumpSetupFailedCount();
            if (n >= SETUP_FAILED_LIMIT) {
              audit(req, 'enrollment_locked', `setup_code failures reached ${n}`);
              return reply.code(429).send({ error: 'setup_locked' });
            }
          }
        }
      } else if (
        ownerExists() &&
        typeof body.backupCode === 'string' &&
        (await isBackupCode(body.backupCode))
      ) {
        // Owner recovery.
        mode = 'reset';
        regAccountId = OWNER_ACCOUNT_ID;
        regAccountName = getAccount(OWNER_ACCOUNT_ID)?.name ?? 'Owner';
      }

      if (!mode) return reply.code(401).send({ error: 'unauthorized' });

      const existing =
        mode === 'authenticated' ? listCredentials(regAccountId) : [];
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: new TextEncoder().encode(regAccountId),
        userName: regAccountName,
        userDisplayName: regAccountName,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'required',
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
      req.session.set('regAccountId', regAccountId);
      req.session.set('regAccountName', regAccountName);
      req.session.set('regServices', JSON.stringify(regServices));
      req.session.set('regCodeId', regCodeId);
      return options;
    },
  );

  app.post(
    '/auth/passkey/register/verify',
    RATE_LIMIT_LOGIN,
    async (req, reply) => {
      const challenge = req.session.get('regChallenge');
      const mode = req.session.get('regMode');
      const regAccountId = req.session.get('regAccountId');
      if (!challenge || !mode || !regAccountId) {
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
          requireUserVerification: true,
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

      const regAccountName = req.session.get('regAccountName') ?? 'Member';
      const regServices = JSON.parse(req.session.get('regServices') ?? '[]') as string[];
      const regCodeId = req.session.get('regCodeId') ?? '';

      const issueBackupCode = mode === 'first' || mode === 'reset';
      const newBackupPlain = issueBackupCode ? generateRegistrationCode() : null;
      const newBackupHash = newBackupPlain ? await hashBackupCode(newBackupPlain) : null;

      const tx = db.transaction(() => {
        if (mode === 'first') {
          ensureOwnerAccount();
        } else if (mode === 'enroll') {
          // Claim the single-use code first; if it was already redeemed (a race
          // between two browsers using the same code) abort the whole tx.
          if (!regCodeId || !markCodeUsed(regCodeId, regAccountId)) {
            throw new CodeAlreadyUsedError();
          }
          createAccount({
            id: regAccountId,
            name: regAccountName,
            services: regServices,
          });
        } else if (mode === 'reset') {
          db.prepare('DELETE FROM credentials WHERE account_id = ?').run(regAccountId);
        }
        db.prepare(
          `INSERT OR REPLACE INTO credentials
             (id, public_key, counter, transports, device_name, created_at, last_used, account_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          credId,
          publicKey,
          counter,
          transports,
          deviceName,
          Date.now(),
          null,
          regAccountId,
        );
        if (newBackupHash) {
          setMeta('backup_code_hash', newBackupHash);
        }
      });
      try {
        tx();
      } catch (err) {
        if (err instanceof CodeAlreadyUsedError) {
          return reply.code(409).send({ error: 'code_already_used' });
        }
        throw err;
      }

      if (mode === 'first') {
        resetSetupFailedCount();
        audit(req, 'first_enrollment', `credential ${credId}`);
      } else if (mode === 'enroll') {
        resetSetupFailedCount();
        audit(req, 'account_enroll', `account ${regAccountId} credential ${credId}`);
      } else if (mode === 'reset') {
        audit(req, 'reset', `credential ${credId}`);
      }

      req.session.set('regChallenge', undefined);
      req.session.set('regMode', undefined);
      req.session.set('regAccountId', undefined);
      req.session.set('regAccountName', undefined);
      req.session.set('regServices', undefined);
      req.session.set('regCodeId', undefined);
      req.session.set('accountId', regAccountId);
      req.session.set('accountIat', Math.floor(Date.now() / 1000));

      const ssoToken = await mintSsoSession(config.ssoSecret, {
        sub: regAccountId,
        name: regAccountName,
      });
      reply.setCookie('nz_session', ssoToken, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: SSO_MAX_AGE_S,
      });

      return { ok: true, backupCode: newBackupPlain };
    },
  );

  app.post('/auth/passkey/login/options', RATE_LIMIT_LOGIN, async (req) => {
    const creds = listCredentials();
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
      allowCredentials: creds.map((c) => ({
        id: c.id,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
    });
    req.session.set('authChallenge', options.challenge);
    return options;
  });

  app.post('/auth/passkey/login/verify', RATE_LIMIT_LOGIN, async (req, reply) => {
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
    if (!row) {
      audit(req, 'login_failure', `unknown_credential ${credId}`);
      return reply.code(401).send({ error: 'unknown_credential' });
    }

    const acct = getAccount(row.account_id);
    if (!acct || acct.status !== 'active') {
      audit(req, 'login_failure', `account_inactive ${row.account_id}`);
      return reply.code(403).send({ error: 'account_disabled' });
    }

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
        requireUserVerification: true,
      });
    } catch (err) {
      app.log.warn({ err }, 'passkey login verification failed');
      audit(req, 'login_failure', `verification_failed ${row.id}`);
      return reply.code(401).send({ error: 'verification_failed' });
    }

    if (!verification.verified) {
      audit(req, 'login_failure', `not_verified ${row.id}`);
      return reply.code(401).send({ error: 'verification_failed' });
    }

    db.prepare(
      'UPDATE credentials SET counter = ?, last_used = ? WHERE id = ?',
    ).run(verification.authenticationInfo.newCounter, Date.now(), row.id);

    req.session.set('authChallenge', undefined);
    req.session.set('accountId', acct.id);
    req.session.set('accountIat', Math.floor(Date.now() / 1000));

    const ssoToken = await mintSsoSession(config.ssoSecret, {
      sub: acct.id,
      name: acct.name,
    });
    reply.setCookie('nz_session', ssoToken, {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: SSO_MAX_AGE_S,
    });

    audit(req, 'login_success', `account ${acct.id} credential ${row.id}`);
    return { ok: true };
  });

  app.get('/auth/passkey/list', async (req, reply) => {
    const accountId = await resolveAccount(req);
    if (!accountId || !getAccount(accountId)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const creds = listCredentials(accountId);
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
    const accountId = await resolveAccount(req);
    if (!accountId || !getAccount(accountId)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { id } = req.params as { id: string };
    // Only delete a passkey that belongs to the calling account.
    db.prepare('DELETE FROM credentials WHERE id = ? AND account_id = ?').run(id, accountId);
    audit(req, 'passkey_delete', `credential ${id}`);
    return { ok: true };
  });

  app.post('/auth/backup-code/rotate', async (req, reply) => {
    const accountId = await resolveAccount(req);
    if (accountId !== OWNER_ACCOUNT_ID) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const code = generateRegistrationCode();
    setMeta('backup_code_hash', await hashBackupCode(code));
    return { backupCode: code };
  });

  // Convenience for the owner UI: who am I + how many accounts exist.
  app.get('/auth/whoami', async (req, reply) => {
    const accountId = await resolveAccount(req);
    if (!accountId) return reply.code(401).send({ error: 'unauthorized' });
    const acct = getAccount(accountId);
    return {
      accountId,
      name: acct?.name ?? null,
      isOwner: acct?.is_owner === 1,
      accountCount: listAccounts().length,
    };
  });
}
