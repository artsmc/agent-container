/**
 * RSA signing key management.
 * Loads private key from PEM, derives public JWK, computes kid, builds JWKS response.
 * Supports key rotation via SIGNING_KEY_PRIVATE_PREVIOUS.
 */
import {
  importPKCS8,
  exportJWK,
  calculateJwkThumbprint,
  type KeyLike,
  type JWK,
} from 'jose';

export interface SigningKeyPair {
  privateKey: KeyLike;
  publicJwk: JWK;
  kid: string;
}

export interface SigningKeys {
  current: SigningKeyPair;
  previous: SigningKeyPair | null;
}

let signingKeys: SigningKeys | null = null;

async function loadKeyPair(pem: string): Promise<SigningKeyPair> {
  // Handle escaped newlines from environment variables
  const normalizedPem = pem.replace(/\\n/g, '\n');
  const privateKey = await importPKCS8(normalizedPem, 'RS256');
  const jwk = await exportJWK(privateKey);
  const kid = await calculateJwkThumbprint(jwk, 'sha256');

  // Strip private key components — JWKS must only expose public key
  const publicJwk: JWK = {
    kty: jwk.kty,
    n: jwk.n,
    e: jwk.e,
    kid,
    use: 'sig',
    alg: 'RS256',
  };

  return {
    privateKey,
    publicJwk,
    kid,
  };
}

export async function initSigningKeys(
  signingKeyPrivate: string,
  signingKeyPrivatePrevious: string | null
): Promise<SigningKeys> {
  const current = await loadKeyPair(signingKeyPrivate);

  let previous: SigningKeyPair | null = null;
  if (signingKeyPrivatePrevious) {
    try {
      previous = await loadKeyPair(signingKeyPrivatePrevious);
    } catch (err) {
      console.warn(
        'Warning: SIGNING_KEY_PRIVATE_PREVIOUS could not be loaded:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  signingKeys = { current, previous };
  return signingKeys;
}

export function getSigningKeys(): SigningKeys {
  if (!signingKeys) {
    throw new Error('Signing keys not initialized. Call initSigningKeys() first.');
  }
  return signingKeys;
}

export function getCurrentKeyPair(): SigningKeyPair {
  return getSigningKeys().current;
}

export function buildJwksResponse(): { keys: JWK[] } {
  const keys = getSigningKeys();
  const jwks: JWK[] = [keys.current.publicJwk];

  if (keys.previous) {
    jwks.push(keys.previous.publicJwk);
  }

  return { keys: jwks };
}
