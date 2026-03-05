import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import { ApiError } from '../errors/api-errors';
import { getPublicAgenda } from '../services/agenda-service';

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

interface SharedRouteOptions {
  db: DbClient;
}

/**
 * Registers the public shared agenda route.
 *
 * This route is registered on the PUBLIC router (no JWT middleware).
 * It does not require authentication.
 */
export async function sharedRoutes(
  fastify: FastifyInstance,
  opts: SharedRouteOptions
): Promise<void> {
  const { db } = opts;

  // GET /shared/:token — Public shared agenda
  fastify.get(
    '/shared/:token',
    async (
      request: FastifyRequest<{ Params: { token: string } }>,
      reply: FastifyReply
    ) => {
      const { token } = request.params;

      const publicAgenda = await getPublicAgenda(db, token);
      if (!publicAgenda) {
        throw new ApiError(404, 'SHARED_LINK_NOT_FOUND', 'No agenda matches this share link');
      }

      void reply.status(200).send(publicAgenda);
    }
  );
}
