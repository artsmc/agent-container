import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiError, ForbiddenError } from '../errors/api-errors';
import { isValidUuid } from '../utils/short-id';
import { verifyClientAccess } from '../services/task-helpers';
import { requireRole } from '../middleware/require-role';
import { requireMastraServiceAccount } from '../middleware/require-mastra';
import {
  TriggerIntakeSchema,
  TriggerAgendaSchema,
  UpdateStatusSchema,
} from '../schemas/workflow.schemas';
import { WorkflowService } from '../services/workflow.service';
import type { WorkflowRunRecord } from '../repositories/workflow.repository';
import type { DbClient } from '../db/client';
import { sendSuccess } from '../helpers/response';

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function formatRunResponse(run: WorkflowRunRecord) {
  return {
    workflow_run_id: run.id,
    workflow_type: run.workflowType,
    client_id: run.clientId,
    status: run.status,
    started_at: run.startedAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
    completed_at: run.completedAt?.toISOString() ?? null,
    input_refs: run.inputRefs,
    result: run.result ?? null,
    error: run.error ?? null,
  };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

interface WorkflowRouteOptions {
  db: DbClient;
  workflowService: WorkflowService;
}

/**
 * Registers workflow orchestration routes.
 *
 * All routes run inside the protected scope (authenticate + loadUser hooks).
 *
 * - POST   /workflows/intake        — Trigger intake workflow
 * - POST   /workflows/agenda        — Trigger agenda workflow
 * - GET    /workflows/:id/status    — Poll workflow status
 * - PATCH  /workflows/:id/status    — Mastra status callback
 */
export async function workflowRoutes(
  fastify: FastifyInstance,
  opts: WorkflowRouteOptions
): Promise<void> {
  const { db, workflowService: svc } = opts;

  // -------------------------------------------------------------------------
  // POST /workflows/intake
  // -------------------------------------------------------------------------
  fastify.post(
    '/workflows/intake',
    {
      preHandler: [requireRole('account_manager', 'admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = TriggerIntakeSchema.parse(request.body);
      const user = request.user!;

      // Client access check
      const hasAccess = await verifyClientAccess(
        db,
        body.client_id,
        user.id,
        user.role
      );
      if (!hasAccess) {
        throw new ForbiddenError(
          'You do not have access to this client.'
        );
      }

      const run = await svc.triggerIntake(
        user.id,
        body.client_id,
        body.transcript_id
      );

      void reply.status(202).send({
        data: {
          workflow_run_id: run.id,
          workflow_type: run.workflowType,
          status: run.status,
          poll_url: `/workflows/${run.id}/status`,
          started_at: run.startedAt.toISOString(),
        },
      });
    }
  );

  // -------------------------------------------------------------------------
  // POST /workflows/agenda
  // -------------------------------------------------------------------------
  fastify.post(
    '/workflows/agenda',
    {
      preHandler: [requireRole('account_manager', 'admin')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = TriggerAgendaSchema.parse(request.body);
      const user = request.user!;

      // Client access check
      const hasAccess = await verifyClientAccess(
        db,
        body.client_id,
        user.id,
        user.role
      );
      if (!hasAccess) {
        throw new ForbiddenError(
          'You do not have access to this client.'
        );
      }

      const run = await svc.triggerAgenda(
        user.id,
        body.client_id,
        body.cycle_start,
        body.cycle_end
      );

      void reply.status(202).send({
        data: {
          workflow_run_id: run.id,
          workflow_type: run.workflowType,
          status: run.status,
          poll_url: `/workflows/${run.id}/status`,
          started_at: run.startedAt.toISOString(),
          input_refs: run.inputRefs,
        },
      });
    }
  );

  // -------------------------------------------------------------------------
  // GET /workflows/:id/status
  // -------------------------------------------------------------------------
  fastify.get(
    '/workflows/:id/status',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const user = request.user!;

      if (!isValidUuid(id)) {
        throw new ApiError(
          404,
          'WORKFLOW_RUN_NOT_FOUND',
          'Workflow run not found'
        );
      }

      const run = await svc.getStatus(user.id, id);

      // Client access check (after fetch so 404 appears before 403)
      const hasAccess = await verifyClientAccess(
        db,
        run.clientId,
        user.id,
        user.role
      );
      if (!hasAccess) {
        throw new ForbiddenError(
          'You do not have access to this workflow run.'
        );
      }

      sendSuccess(reply, formatRunResponse(run));
    }
  );

  // -------------------------------------------------------------------------
  // PATCH /workflows/:id/status (Mastra service account only)
  // -------------------------------------------------------------------------
  fastify.patch(
    '/workflows/:id/status',
    {
      preHandler: [requireMastraServiceAccount],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      if (!isValidUuid(id)) {
        throw new ApiError(
          404,
          'WORKFLOW_RUN_NOT_FOUND',
          'Workflow run not found'
        );
      }

      const body = UpdateStatusSchema.parse(request.body);
      const run = await svc.updateStatus(
        id,
        body.status,
        body.result,
        body.error
      );

      sendSuccess(reply, formatRunResponse(run));
    }
  );
}
