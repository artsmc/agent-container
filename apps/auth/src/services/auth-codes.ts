/**
 * Authorization code store (in-memory with 5-minute TTL).
 * For horizontal scaling, migrate to Postgres.
 */
import { randomBytes } from 'node:crypto';
import type { AuthCodeRecord } from '../types.js';
import { InvalidGrantError } from '../errors.js';

const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const authCodeStore = new Map<string, AuthCodeRecord>();

export function createAuthCode(params: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  scope: string;
  nonce: string | null;
}): string {
  const code = randomBytes(32).toString('base64url');

  const record: AuthCodeRecord = {
    code,
    userId: params.userId,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    scope: params.scope,
    nonce: params.nonce,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    used: false,
  };

  authCodeStore.set(code, record);
  return code;
}

export function consumeAuthCode(code: string): AuthCodeRecord {
  const record = authCodeStore.get(code);

  if (!record) {
    throw new InvalidGrantError('The authorization code is invalid.');
  }

  // Check if already used -- potential replay attack
  if (record.used) {
    // Security measure: delete the code to prevent further analysis
    authCodeStore.delete(code);
    console.warn(
      `SECURITY: Authorization code reuse detected for client ${record.clientId}, user ${record.userId}`
    );
    throw new InvalidGrantError(
      'The authorization code has already been used.'
    );
  }

  // Check expiration
  if (record.expiresAt.getTime() < Date.now()) {
    authCodeStore.delete(code);
    throw new InvalidGrantError('The authorization code has expired.');
  }

  // Mark as used
  record.used = true;

  return record;
}

/**
 * Evict expired auth codes. Called by the cleanup job.
 */
export function evictExpiredAuthCodes(): number {
  const now = Date.now();
  let count = 0;
  for (const [code, record] of authCodeStore) {
    if (record.expiresAt.getTime() < now) {
      authCodeStore.delete(code);
      count++;
    }
  }
  return count;
}
