/**
 * Token service: JWT signing, verification, and refresh token generation.
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { getCurrentKeyPair, getSigningKeys } from '../signing-keys.js';
import { UnauthorizedError } from '../errors.js';

export interface SignAccessTokenParams {
  sub: string;
  aud: string;
  scope: string;
  iss: string;
  clientId?: string;
  jti?: string;
}

export interface SignIdTokenParams {
  sub: string;
  aud: string;
  iss: string;
  email?: string;
  name?: string;
  picture?: string;
  nonce?: string;
}

export async function signAccessToken(
  params: SignAccessTokenParams,
  lifetimeSeconds: number
): Promise<string> {
  const { privateKey, kid } = getCurrentKeyPair();

  const payload: Record<string, unknown> = {
    scope: params.scope,
  };

  if (params.clientId) {
    payload.client_id = params.clientId;
  }

  if (params.jti) {
    payload.jti = params.jti;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer(params.iss)
    .setSubject(params.sub)
    .setAudience(params.aud)
    .setIssuedAt()
    .setExpirationTime(`${lifetimeSeconds}s`)
    .sign(privateKey);
}

export async function signIdToken(
  params: SignIdTokenParams,
  lifetimeSeconds: number
): Promise<string> {
  const { privateKey, kid } = getCurrentKeyPair();

  const payload: Record<string, unknown> = {};

  if (params.email) {
    payload.email = params.email;
  }
  if (params.name) {
    payload.name = params.name;
  }
  if (params.picture) {
    payload.picture = params.picture;
  }
  if (params.nonce) {
    payload.nonce = params.nonce;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer(params.iss)
    .setSubject(params.sub)
    .setAudience(params.aud)
    .setIssuedAt()
    .setExpirationTime(`${lifetimeSeconds}s`)
    .sign(privateKey);
}

export async function verifyAccessToken(
  token: string,
  issuer: string,
  audience: string
): Promise<JWTPayload> {
  const keys = getSigningKeys();

  // Try the current key first, then the previous key for rotation support
  const keysToTry = [keys.current];
  if (keys.previous) {
    keysToTry.push(keys.previous);
  }

  let lastError: unknown;
  for (const keyPair of keysToTry) {
    try {
      const { payload } = await jwtVerify(token, keyPair.privateKey, {
        issuer,
        audience,
      });
      return payload;
    } catch (err) {
      lastError = err;
    }
  }

  throw new UnauthorizedError(
    lastError instanceof Error ? lastError.message : 'Token verification failed.'
  );
}

/**
 * Generate a cryptographically random refresh token (32 bytes, base64url encoded).
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash a refresh token for storage using SHA-256.
 * Refresh tokens are high-entropy random values so SHA-256 is sufficient
 * (unlike passwords which need argon2/bcrypt).
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
