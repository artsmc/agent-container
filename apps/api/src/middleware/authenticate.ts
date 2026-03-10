import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TokenValidator, TokenClaims } from '@iexcel/auth-client';
import type { DbClient } from '../db/client';
import { UnauthorizedError } from '../errors/api-errors';
import { isDeviceToken } from '../utils/device-token';
import { validateDeviceToken } from '../services/device-token-service';

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
 * Builds a Fastify preHandler hook that validates Bearer tokens.
 *
 * Supports two token types:
 * 1. **Device tokens** (prefixed with "ixl_") — validated against the
 *    device_tokens table. A synthetic TokenClaims object is constructed
 *    from the associated user record so downstream middleware (loadUser)
 *    works identically to the JWT path.
 * 2. **JWTs** — validated by the OIDC TokenValidator (existing behavior).
 *
 * On success, attaches the validated `TokenClaims` to `request.tokenClaims`.
 * On failure, throws an `UnauthorizedError`.
 *
 * @param validator - A TokenValidator instance from @iexcel/auth-client
 * @param db - Drizzle database client for device token lookups
 */
export function buildAuthMiddleware(validator: TokenValidator, db: DbClient) {
  return async function authenticateHook(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    // Device token path: tokens prefixed with "ixl_"
    if (isDeviceToken(token)) {
      const fingerprint =
        (request.headers['x-device-fingerprint'] as string | undefined) ?? undefined;

      const result = await validateDeviceToken(db, token, fingerprint);

      if (!result) {
        throw new UnauthorizedError('Invalid or expired device token');
      }

      // Construct synthetic TokenClaims that loadUser expects.
      // sub must be authUserId because loadUser queries users.authUserId.
      const syntheticClaims: TokenClaims = {
        iss: 'device-token',
        sub: result.authUserId,
        aud: 'iexcel-api',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        email: result.email,
        name: result.name,
      };

      request.tokenClaims = syntheticClaims;
      return;
    }

    // JWT path: validate with the OIDC token validator
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
