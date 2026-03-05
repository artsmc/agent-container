/**
 * Client service: lookup, grant type checks, secret verification.
 */
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { getClientByClientId } from '../db/clients.js';
import { InvalidClientError, UnauthorizedClientError } from '../errors.js';
import type { OidcClient } from '../types.js';

export async function lookupClient(clientId: string): Promise<OidcClient> {
  const client = await getClientByClientId(clientId);
  if (!client || !client.is_active) {
    throw new InvalidClientError(`Client '${clientId}' not found or is inactive.`);
  }
  return client;
}

export function assertClientSupportsGrant(client: OidcClient, grantType: string): void {
  // Normalize device_code grant type name for comparison
  const normalizedGrantTypes = client.grant_types.map((gt) =>
    gt === 'device_code' ? 'urn:ietf:params:oauth:grant-type:device_code' : gt
  );

  if (!normalizedGrantTypes.includes(grantType) && !client.grant_types.includes(grantType)) {
    throw new UnauthorizedClientError(
      `Client '${client.client_id}' is not authorized for grant type '${grantType}'.`
    );
  }
}

export async function verifyClientSecret(
  client: OidcClient,
  secret: string
): Promise<void> {
  if (!client.client_secret_hash) {
    throw new InvalidClientError('Client has no secret configured.');
  }

  const valid = await argon2.verify(client.client_secret_hash, secret);
  if (!valid) {
    throw new InvalidClientError('Invalid client secret.');
  }
}

export async function generateAndHashClientSecret(): Promise<{
  plaintext: string;
  hash: string;
}> {
  const plaintext = randomBytes(32).toString('base64url');
  const hash = await argon2.hash(plaintext);
  return { plaintext, hash };
}
