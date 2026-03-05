import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TokenValidator } from '@iexcel/auth-client';
import { UnauthorizedError } from '../errors/api-errors';

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns undefined if the header is missing or malformed.
 */
function extractBearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return undefined;

  return parts[1];
}

/**
 * Builds a Fastify preHandler hook that validates JWT Bearer tokens.
 *
 * On success, attaches the validated `TokenClaims` to `request.tokenClaims`.
 * On failure, throws an `UnauthorizedError`.
 *
 * @param validator - A TokenValidator instance from @iexcel/auth-client
 */
export function buildAuthMiddleware(validator: TokenValidator) {
  return async function authenticateHook(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    try {
      const claims = await validator.validateToken(token);
      request.tokenClaims = claims;
    } catch (error) {
      const message =
        error instanceof Error
          ? `Token validation failed: ${error.message}`
          : 'Token validation failed';
      throw new UnauthorizedError(message);
    }
  };
}
