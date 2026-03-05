/**
 * Bearer token authentication middleware for Fastify.
 * Extracts the token from the Authorization header, verifies it,
 * and attaches the authenticated user to the request.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../services/token.js';
import { UnauthorizedError } from '../errors.js';
import type { AuthenticatedUser } from '../types.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  issuer: string,
  audience: string
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new UnauthorizedError('Missing or malformed Authorization header.');
    reply.status(err.statusCode).send(err.toJSON());
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token, issuer, audience);

    request.authUser = {
      sub: payload.sub ?? '',
      scope: (payload.scope as string) ?? '',
      clientId: payload.client_id as string | undefined,
    };
  } catch (err) {
    const authErr =
      err instanceof UnauthorizedError
        ? err
        : new UnauthorizedError('Invalid or expired access token.');
    reply.status(authErr.statusCode).send(authErr.toJSON());
  }
}

/**
 * Creates a Fastify onRequest hook for authentication.
 */
export function createAuthHook(issuer: string, audience: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authMiddleware(request, reply, issuer, audience);
  };
}
