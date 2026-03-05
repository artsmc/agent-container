import type { FastifyRequest } from 'fastify';

type VersionSource = 'agent' | 'ui' | 'terminal';

/**
 * Detects the source of a request based on token claims and headers.
 *
 * Resolution order:
 * 1. If the token is a service account (client_credentials grant), returns 'agent'.
 * 2. If the X-Client-Type header is 'terminal', returns 'terminal'.
 * 3. Otherwise, returns 'ui'.
 *
 * The X-Client-Type header is validated against known values.
 * Invalid values fall back to 'ui'.
 */
export function detectSource(request: FastifyRequest): VersionSource {
  const claims = request.tokenClaims;

  // Service accounts (Mastra) use client_credentials grant
  // Identified by grant_type claim or absence of user-level claims
  if (claims?.['grant_type'] === 'client_credentials') {
    return 'agent';
  }

  // Check X-Client-Type header for terminal clients
  const clientType = request.headers['x-client-type'];
  if (typeof clientType === 'string' && clientType.toLowerCase() === 'terminal') {
    return 'terminal';
  }

  return 'ui';
}
