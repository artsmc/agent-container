/**
 * GET /userinfo
 * Returns the authenticated user's identity claims.
 * Requires a valid bearer token with at least the openid scope.
 */
import type { FastifyInstance } from 'fastify';
import { getUserById } from '../db/users.js';
import { createAuthHook } from '../middleware/auth.js';

export function registerUserinfoRoute(
  app: FastifyInstance,
  issuerUrl: string,
  audience: string
): void {
  const authHook = createAuthHook(issuerUrl, audience);

  app.get(
    '/userinfo',
    { onRequest: authHook },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({
          error: 'invalid_token',
          error_description: 'Authentication required.',
        });
      }

      // Check openid scope
      const scopes = authUser.scope.split(' ');
      if (!scopes.includes('openid')) {
        return reply.status(403).send({
          error: 'insufficient_scope',
          error_description: 'The openid scope is required.',
        });
      }

      // Look up user
      const user = await getUserById(authUser.sub);
      if (!user) {
        return reply.status(404).send({
          error: 'invalid_token',
          error_description: 'User not found.',
        });
      }

      // Build response based on granted scopes
      const response: Record<string, string> = {
        sub: user.id,
      };

      if (scopes.includes('email')) {
        response.email = user.email;
      }

      if (scopes.includes('profile')) {
        response.name = user.name;
        if (user.picture) {
          response.picture = user.picture;
        }
      }

      return reply.status(200).send(response);
    }
  );
}
