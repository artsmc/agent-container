/**
 * PKCE (Proof Key for Code Exchange) utilities — RFC 7636.
 * Uses the Web Crypto API (globalThis.crypto) for SHA-256.
 */

const CODE_VERIFIER_LENGTH = 96; // bytes → 128 base64url characters

export interface PkceChallenge {
  /** The randomly generated code verifier to store client-side. */
  codeVerifier: string;
  /** The S256 code challenge to send to the authorization endpoint. */
  codeChallenge: string;
  /** Always 'S256'. */
  codeChallengeMethod: 'S256';
}

/**
 * Generates a PKCE code verifier and its SHA-256 code challenge.
 * Uses Web Crypto API (available in Node 18+, all modern browsers).
 */
export async function generatePkceChallenge(): Promise<PkceChallenge> {
  // Generate cryptographically random bytes
  const randomBytes = new Uint8Array(CODE_VERIFIER_LENGTH);
  globalThis.crypto.getRandomValues(randomBytes);

  // Base64url-encode the verifier (RFC 7636 §4.1)
  const codeVerifier = base64UrlEncode(randomBytes);

  // SHA-256 hash the verifier
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);

  // Base64url-encode the hash for the challenge
  const codeChallenge = base64UrlEncode(new Uint8Array(hashBuffer));

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

function base64UrlEncode(buffer: Uint8Array): string {
  // Convert to base64 then make URL-safe
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
