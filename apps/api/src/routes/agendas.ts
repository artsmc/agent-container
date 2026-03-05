import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import { ApiError, ForbiddenError, BusinessError } from '../errors/api-errors';
import { isValidUuid } from '../utils/short-id';
import { resolveAgendaId } from '../utils/agenda-short-id';
import { detectSource } from '../utils/source-detection';
import {
  createAgendaBodySchema,
  listAgendasQuerySchema,
  editAgendaBodySchema,
  finalizeAgendaBodySchema,
  emailAgendaBodySchema,
  stripNonEditableAgendaFields,
} from '../validators/agenda-validators';
import {
  createAgenda,
  listAgendas,
  getAgendaDetail,
  editAgenda,
  finalizeAgenda,
  shareAgenda,
  emailAgenda,
  exportAgenda,
} from '../services/agenda-service';
import { verifyClientAccess } from '../services/task-helpers';

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

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

interface AgendaRouteOptions {
  db: DbClient;
}

/**
 * Registers authenticated agenda management routes.
 *
 * All routes run inside the protected scope (authenticate + loadUser hooks).
 */
export async function agendaRoutes(
  fastify: FastifyInstance,
  opts: AgendaRouteOptions
): Promise<void> {
  const { db } = opts;

  // =========================================================================
  // Client-scoped routes
  // =========================================================================

  // POST /clients/:client_id/agendas — Create draft agenda
  fastify.post(
    '/clients/:client_id/agendas',
    async (
      request: FastifyRequest<{ Params: { client_id: string } }>,
      reply: FastifyReply
    ) => {
      const { client_id } = request.params;
      const user = request.user!;

      if (!isValidUuid(client_id)) throw clientNotFoundError();

      const hasAccess = await verifyClientAccess(db, client_id, user.id, user.role);
      if (!hasAccess) throw clientNotFoundError();

      const bodyResult = createAgendaBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR', 'Request body failed validation.', {
          validation_errors: bodyResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      const source = detectSource(request);
      const created = await createAgenda(db, client_id, user.id, bodyResult.data, source);
      void reply.status(201).send(created);
    }
  );

  // GET /clients/:client_id/agendas — List agendas
  fastify.get(
    '/clients/:client_id/agendas',
    async (
      request: FastifyRequest<{ Params: { client_id: string } }>,
      reply: FastifyReply
    ) => {
      const { client_id } = request.params;
      const user = request.user!;

      if (!isValidUuid(client_id)) throw clientNotFoundError();

      const hasAccess = await verifyClientAccess(db, client_id, user.id, user.role);
      if (!hasAccess) throw clientNotFoundError();

      const queryResult = listAgendasQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR',
          queryResult.error.issues[0]?.message ?? 'Invalid query parameters', {});
      }

      const { status, page, per_page: perPage } = queryResult.data;
      const result = await listAgendas(db, client_id, { status }, page, perPage);
      const totalPages = perPage > 0 ? Math.ceil(result.total / perPage) : 0;

      void reply.status(200).send({
        data: result.data,
        pagination: { page, per_page: perPage, total: result.total, total_pages: totalPages },
      });
    }
  );

  // =========================================================================
  // Agenda-scoped routes (no client_id in path)
  // =========================================================================

  // POST /agendas/:id/finalize — Finalize agenda
  fastify.post(
    '/agendas/:id/finalize',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const source = detectSource(request);

      const bodyResult = finalizeAgendaBodySchema.safeParse(request.body ?? {});
      if (!bodyResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR',
          bodyResult.error.issues[0]?.message ?? 'Invalid request body', {});
      }

      const detail = await finalizeAgenda(
        db, request.params.id, user.id, user.role, bodyResult.data.force, source
      );
      void reply.status(200).send(detail);
    }
  );

  // POST /agendas/:id/share — Share agenda
  fastify.post(
    '/agendas/:id/share',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const source = detectSource(request);

      const result = await shareAgenda(db, request.params.id, user.id, user.role, source);
      void reply.status(200).send(result);
    }
  );

  // POST /agendas/:id/email — Email agenda
  fastify.post(
    '/agendas/:id/email',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const source = detectSource(request);

      const bodyResult = emailAgendaBodySchema.safeParse(request.body ?? {});
      if (!bodyResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR',
          bodyResult.error.issues[0]?.message ?? 'Invalid request body', {});
      }

      const result = await emailAgenda(
        db, request.params.id, user.id, user.role, bodyResult.data, source
      );
      void reply.status(200).send(result);
    }
  );

  // POST /agendas/:id/export — Export agenda to Google Docs
  fastify.post(
    '/agendas/:id/export',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const source = detectSource(request);

      const result = await exportAgenda(db, request.params.id, user.id, user.role, source);
      void reply.status(200).send(result);
    }
  );

  // GET /agendas/:id — Get agenda detail
  fastify.get(
    '/agendas/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const agendaId = await resolveAgendaId(request.params.id, db);

      const detail = await getAgendaDetail(db, agendaId);
      if (!detail) {
        throw new ApiError(404, 'AGENDA_NOT_FOUND', 'Agenda not found');
      }

      const hasAccess = await verifyClientAccess(db, detail.client_id, user.id, user.role);
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this agenda');
      }

      void reply.status(200).send(detail);
    }
  );

  // PATCH /agendas/:id — Edit agenda
  fastify.patch(
    '/agendas/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const source = detectSource(request);

      const rawBody = request.body as Record<string, unknown> | null;
      const strippedBody = rawBody ? stripNonEditableAgendaFields(rawBody) : {};

      const bodyResult = editAgendaBodySchema.safeParse(strippedBody);
      if (!bodyResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR', 'Request body failed validation.', {
          validation_errors: bodyResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      const detail = await editAgenda(db, request.params.id, user.id, user.role, bodyResult.data, source);
      void reply.status(200).send(detail);
    }
  );
}
