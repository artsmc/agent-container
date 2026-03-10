/**
 * HMAC webhook signature verification.
 *
 * Verifies that incoming webhook requests are authentic by checking
 * the platform-provided HMAC signature against the raw request body.
 * Uses constant-time comparison to prevent timing attacks.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies an HMAC-SHA256 signature against a raw body.
 *
 * @param rawBody - The raw request body bytes.
 * @param signature - The signature from the platform's header.
 * @param secret - The shared secret (webhook signing key).
 * @param prefix - Optional prefix to strip from signature (e.g., 'sha256=').
 * @returns true if the signature is valid.
 */
export function verifyHmacSignature(
  rawBody: Buffer | string,
  signature: string,
  secret: string,
  prefix?: string
): boolean {
  if (!signature || !secret) return false;

  const sig = prefix && signature.startsWith(prefix)
    ? signature.slice(prefix.length)
    : signature;

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison
  if (sig.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(sig, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

/**
 * Platform-specific signature header names.
 */
export const WEBHOOK_SIGNATURE_HEADERS: Record<string, string> = {
  fireflies: 'x-fireflies-signature',
  grain: 'x-grain-signature',
};
