import type { FastifyInstance } from 'fastify';
import { sendSuccess } from '../helpers/response';

/**
 * Registers the current-user route.
 *
 * GET /me — protected (requires authenticate + loadUser hooks on the
 * parent scope). Returns the authenticated user's product profile.
 */
export async function meRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/me', async (request, reply) => {
    // request.user is guaranteed by the loadUser middleware
    // registered on the parent protected scope.
    sendSuccess(reply, request.user);
  });
}
