import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import { ApiError, ForbiddenError } from '../errors/api-errors';
import {
  isValidUuid,
  patchClientBodySchema,
  listClientsQuerySchema,
  type PatchClientBody,
} from '../validators/client-validators';
import {
  listClients,
  getClientById,
  updateClient,
  getClientTaskCounts,
  getMostRecentAgenda,
  writeAuditLog,
  computeChangedFields,
  type ClientStatusResult,
} from '../services/client-service';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function clientNotFoundError(): ApiError {
  return new ApiError(
    404,
    'CLIENT_NOT_FOUND',
    'The requested client does not exist or you do not have access to it.'
  );
}

function invalidIdError(): ApiError {
  return new ApiError(400, 'INVALID_ID', 'The provided ID is not a valid UUID.');
}

function invalidBodyError(message: string): ApiError {
  return new ApiError(400, 'INVALID_BODY', message);
}

function invalidPaginationError(message: string): ApiError {
  return new ApiError(400, 'INVALID_PAGINATION', message);
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

interface ClientRouteOptions {
  db: DbClient;
}

/**
 * Registers client management routes.
 *
 * All routes run inside the protected scope (authenticate + loadUser hooks).
 *
 * - GET    /clients          - List clients (paginated, role-scoped)
 * - GET    /clients/:id      - Get client detail
 * - PATCH  /clients/:id      - Update client configuration
 * - GET    /clients/:id/status - Get client status overview
 */
export async function clientRoutes(
  fastify: FastifyInstance,
  opts: ClientRouteOptions
): Promise<void> {
  const { db } = opts;

  // -------------------------------------------------------------------------
  // GET /clients
  // -------------------------------------------------------------------------
  fastify.get(
    '/clients',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;

      // Validate query params
      const queryResult = listClientsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        const firstIssue = queryResult.error.issues[0];
        throw invalidPaginationError(
          firstIssue?.message ?? 'Invalid pagination parameters'
        );
      }

      const { page, per_page: perPage } = queryResult.data;

      const result = await listClients(db, user.id, user.role, page, perPage);

      const totalPages = perPage > 0 ? Math.ceil(result.total / perPage) : 0;

      void reply.status(200).send({
        data: result.rows,
        pagination: {
          page,
          per_page: perPage,
          total: result.total,
          total_pages: totalPages,
        },
      });
    }
  );

  // -------------------------------------------------------------------------
  // GET /clients/:id
  // -------------------------------------------------------------------------
  fastify.get(
    '/clients/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const user = request.user!;

      if (!isValidUuid(id)) {
        throw invalidIdError();
      }

      const client = await getClientById(db, id, user.id, user.role);
      if (!client) {
        throw clientNotFoundError();
      }

      void reply.status(200).send(client);
    }
  );

  // -------------------------------------------------------------------------
  // PATCH /clients/:id
  // -------------------------------------------------------------------------
  fastify.patch(
    '/clients/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const user = request.user!;

      // Validate UUID
      if (!isValidUuid(id)) {
        throw invalidIdError();
      }

      // Validate body
      const bodyResult = patchClientBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        const firstIssue = bodyResult.error.issues[0];
        throw invalidBodyError(
          firstIssue?.message ?? 'Invalid request body'
        );
      }
      const patchBody: PatchClientBody = bodyResult.data;

      // Role check: Team Members cannot PATCH
      if (user.role === 'team_member') {
        throw new ForbiddenError(
          'Team members are not permitted to update client configuration'
        );
      }

      // Access check: fetch current client (also used for changed_fields diff)
      const currentClient = await getClientById(db, id, user.id, user.role);
      if (!currentClient) {
        throw clientNotFoundError();
      }

      // Compute which fields actually changed
      const changedFields = computeChangedFields(currentClient, patchBody);

      // Perform the update
      const updatedClient = await updateClient(db, id, patchBody);

      // Write audit log (fire-and-forget is acceptable, but we await for correctness)
      await writeAuditLog(db, {
        userId: user.id,
        action: 'client.updated',
        entityType: 'client',
        entityId: id,
        metadata: { changed_fields: changedFields },
        source: 'ui',
      });

      void reply.status(200).send(updatedClient);
    }
  );

  // -------------------------------------------------------------------------
  // GET /clients/:id/status
  // -------------------------------------------------------------------------
  fastify.get(
    '/clients/:id/status',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const user = request.user!;

      if (!isValidUuid(id)) {
        throw invalidIdError();
      }

      const client = await getClientById(db, id, user.id, user.role);
      if (!client) {
        throw clientNotFoundError();
      }

      // Execute task counts and agenda lookup concurrently
      const [taskCounts, currentAgenda] = await Promise.all([
        getClientTaskCounts(db, id),
        getMostRecentAgenda(db, id),
      ]);

      const isReadyToShare =
        currentAgenda !== null && currentAgenda.status === 'finalized';

      const statusResponse: ClientStatusResult = {
        client_id: client.id,
        client_name: client.name,
        tasks: taskCounts,
        agenda: {
          current: currentAgenda,
          is_ready_to_share: isReadyToShare,
        },
        next_call: null,
      };

      void reply.status(200).send(statusResponse);
    }
  );
}
