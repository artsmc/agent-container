/**
 * Admin scope enforcement middleware for Fastify.
 * Checks that the authenticated user has the admin scope.
 * Must run after the auth middleware.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { InsufficientScopeError, UnauthorizedError } from '../errors.js';

export function createAdminHook(adminScope: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      const err = new UnauthorizedError('Authentication required.');
      reply.status(err.statusCode).send(err.toJSON());
      return;
    }

    const scopes = request.authUser.scope.split(' ');
    if (!scopes.includes(adminScope)) {
      const err = new InsufficientScopeError(
        `The '${adminScope}' scope is required for this endpoint.`
      );
      reply.status(err.statusCode).send(err.toJSON());
      return;
    }
  };
}
