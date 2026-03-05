import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../errors/api-errors.js';

/**
 * Fastify preHandler hook that restricts access to the Mastra service account.
 *
 * The Mastra service account authenticates via OIDC client credentials grant.
 * The resulting token carries an 'azp', 'sub', or 'client_id' claim matching
 * the configured MASTRA_CLIENT_ID environment variable.
 */
export async function requireMastraServiceAccount(
  req: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const mastraClientId = process.env['MASTRA_CLIENT_ID'] ?? 'mastra-agent';

  const claims = req.tokenClaims;
  if (!claims) {
    throw new ForbiddenError('This endpoint is restricted to the Mastra service account.');
  }

  const isServiceToken =
    claims.sub === mastraClientId ||
    (claims as Record<string, unknown>)['azp'] === mastraClientId ||
    (claims as Record<string, unknown>)['client_id'] === mastraClientId;

  if (!isServiceToken) {
    throw new ForbiddenError('This endpoint is restricted to the Mastra service account.');
  }
}
