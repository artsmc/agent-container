import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import { ApiError, ForbiddenError, BusinessError } from '../errors/api-errors';
import { isValidUuid, resolveTaskId } from '../utils/short-id';
import { detectSource } from '../utils/source-detection';
import {
  createTasksBodySchema,
  listTasksQuerySchema,
  editTaskBodySchema,
  rejectTaskBodySchema,
  batchTaskIdsBodySchema,
  stripNonEditableFields,
} from '../validators/task-validators';
import {
  createTasks,
  listTasks,
  getTaskDetail,
  editTask,
  approveTask,
  rejectTask,
  pushTask,
  batchApprove,
  batchPush,
  verifyClientAccess,
} from '../services/task-service';

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

interface TaskRouteOptions {
  db: DbClient;
}

/**
 * Registers task management routes.
 *
 * All routes run inside the protected scope (authenticate + loadUser hooks).
 *
 * IMPORTANT: Batch routes (approve, push) are registered BEFORE the
 * parameterized POST /clients/:client_id/tasks to avoid routing conflicts.
 */
export async function taskRoutes(
  fastify: FastifyInstance,
  opts: TaskRouteOptions
): Promise<void> {
  const { db } = opts;

  // =========================================================================
  // Client-scoped batch routes (MUST be registered FIRST)
  // =========================================================================

  fastify.post(
    '/clients/:client_id/tasks/approve',
    async (
      request: FastifyRequest<{ Params: { client_id: string } }>,
      reply: FastifyReply
    ) => {
      const { client_id } = request.params;
      const user = request.user!;

      if (!isValidUuid(client_id)) throw clientNotFoundError();

      const hasAccess = await verifyClientAccess(db, client_id, user.id, user.role);
      if (!hasAccess) throw clientNotFoundError();

      if (user.role !== 'account_manager' && user.role !== 'admin') {
        throw new ForbiddenError('Only account managers and admins can approve tasks');
      }

      const bodyResult = batchTaskIdsBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR',
          bodyResult.error.issues[0]?.message ?? 'Invalid request body', {});
      }

      const source = detectSource(request);
      const result = await batchApprove(db, bodyResult.data.task_ids, user.id, user.role, source);
      void reply.status(200).send(result);
    }
  );

  fastify.post(
    '/clients/:client_id/tasks/push',
    async (
      request: FastifyRequest<{ Params: { client_id: string } }>,
      reply: FastifyReply
    ) => {
      const { client_id } = request.params;
      const user = request.user!;

      if (!isValidUuid(client_id)) throw clientNotFoundError();

      const hasAccess = await verifyClientAccess(db, client_id, user.id, user.role);
      if (!hasAccess) throw clientNotFoundError();

      const bodyResult = batchTaskIdsBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR',
          bodyResult.error.issues[0]?.message ?? 'Invalid request body', {});
      }

      const source = detectSource(request);
      const result = await batchPush(db, bodyResult.data.task_ids, user.id, user.role, source);
      void reply.status(200).send(result);
    }
  );

  // =========================================================================
  // Client-scoped CRUD routes
  // =========================================================================

  fastify.post(
    '/clients/:client_id/tasks',
    async (
      request: FastifyRequest<{ Params: { client_id: string } }>,
      reply: FastifyReply
    ) => {
      const { client_id } = request.params;
      const user = request.user!;

      if (!isValidUuid(client_id)) throw clientNotFoundError();

      const hasAccess = await verifyClientAccess(db, client_id, user.id, user.role);
      if (!hasAccess) throw clientNotFoundError();

      const bodyResult = createTasksBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR', 'Request body failed validation.', {
          validation_errors: bodyResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      const source = detectSource(request);
      const created = await createTasks(db, client_id, user.id, bodyResult.data, source);
      void reply.status(201).send({ data: created });
    }
  );

  fastify.get(
    '/clients/:client_id/tasks',
    async (
      request: FastifyRequest<{ Params: { client_id: string } }>,
      reply: FastifyReply
    ) => {
      const { client_id } = request.params;
      const user = request.user!;

      if (!isValidUuid(client_id)) throw clientNotFoundError();

      const hasAccess = await verifyClientAccess(db, client_id, user.id, user.role);
      if (!hasAccess) throw clientNotFoundError();

      const queryResult = listTasksQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR',
          queryResult.error.issues[0]?.message ?? 'Invalid query parameters', {});
      }

      const { status, transcript_id, page, per_page: perPage } = queryResult.data;
      const result = await listTasks(db, client_id, { status, transcript_id }, page, perPage);
      const totalPages = perPage > 0 ? Math.ceil(result.total / perPage) : 0;

      void reply.status(200).send({
        data: result.data,
        pagination: { page, per_page: perPage, total: result.total, total_pages: totalPages },
      });
    }
  );

  // =========================================================================
  // Task-scoped routes (no client_id in path)
  // =========================================================================

  fastify.post(
    '/tasks/:id/approve',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const source = detectSource(request);
      const detail = await approveTask(db, request.params.id, user.id, user.role, source);
      void reply.status(200).send(detail);
    }
  );

  fastify.post(
    '/tasks/:id/reject',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const source = detectSource(request);

      const bodyResult = rejectTaskBodySchema.safeParse(request.body ?? {});
      if (!bodyResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR',
          bodyResult.error.issues[0]?.message ?? 'Invalid request body', {});
      }

      const detail = await rejectTask(db, request.params.id, user.id, user.role, bodyResult.data?.reason, source);
      void reply.status(200).send(detail);
    }
  );

  fastify.post(
    '/tasks/:id/push',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const source = detectSource(request);
      const detail = await pushTask(db, request.params.id, user.id, user.role, source);
      void reply.status(200).send(detail);
    }
  );

  fastify.get(
    '/tasks/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const taskId = await resolveTaskId(request.params.id, db);

      const detail = await getTaskDetail(db, taskId);
      if (!detail) {
        throw new ApiError(404, 'TASK_NOT_FOUND', 'Task not found');
      }

      const hasAccess = await verifyClientAccess(db, detail.client_id, user.id, user.role);
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this task');
      }

      void reply.status(200).send(detail);
    }
  );

  fastify.patch(
    '/tasks/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = request.user!;
      const source = detectSource(request);

      const rawBody = request.body as Record<string, unknown> | null;
      const strippedBody = rawBody ? stripNonEditableFields(rawBody) : {};

      const bodyResult = editTaskBodySchema.safeParse(strippedBody);
      if (!bodyResult.success) {
        throw new BusinessError(422, 'VALIDATION_ERROR', 'Request body failed validation.', {
          validation_errors: bodyResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      const detail = await editTask(db, request.params.id, user.id, user.role, bodyResult.data, source);
      void reply.status(200).send(detail);
    }
  );
}
