/**
 * Import Route Handlers (Feature 38)
 *
 * POST /clients/:id/import      — Trigger historical import (returns 202)
 * GET  /clients/:id/import/status — Poll import job status
 *
 * Both routes are gated by the HISTORICAL_IMPORT_ENABLED feature flag.
 * Auth middleware is applied by the parent protected scope.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import { triggerImport, getImportStatus } from '../services/import-job-service';

// ---------------------------------------------------------------------------
// Route options
// ---------------------------------------------------------------------------

interface ImportRouteOptions {
  db: DbClient;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers the import endpoints under the protected scope.
 * Gated by HISTORICAL_IMPORT_ENABLED (defaults to true).
 */
export async function importRoutes(
  fastify: FastifyInstance,
  opts: ImportRouteOptions
): Promise<void> {
  const { db } = opts;

  // Feature flag check
  const enabled = process.env['HISTORICAL_IMPORT_ENABLED'] !== 'false';
  if (!enabled) {
    fastify.log.info('Historical import routes disabled (HISTORICAL_IMPORT_ENABLED=false)');
    return;
  }

  // -------------------------------------------------------------------------
  // POST /clients/:id/import — Trigger historical import
  // -------------------------------------------------------------------------
  fastify.post(
    '/clients/:id/import',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const user = request.user!;

      const body = (request.body ?? {}) as Record<string, unknown>;

      const result = await triggerImport(db, {
        clientId: id,
        userId: user.id,
        userRole: user.role,
        grainPlaylistId: body['grain_playlist_id'] as string | undefined,
        asanaProjectId: body['asana_project_id'] as string | undefined,
        asanaWorkspaceId: body['asana_workspace_id'] as string | undefined,
        reprocessTranscripts: body['reprocess_transcripts'] as boolean | undefined,
        callTypeOverride: body['call_type_override'] as string | undefined,
      });

      void reply.status(202).send(result);
    }
  );

  // -------------------------------------------------------------------------
  // GET /clients/:id/import/status — Poll import job status
  // -------------------------------------------------------------------------
  fastify.get(
    '/clients/:id/import/status',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { job_id?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const user = request.user!;
      const query = (request.query ?? {}) as Record<string, string>;

      const result = await getImportStatus(
        db,
        id,
        user.id,
        user.role,
        query['job_id']
      );

      void reply.status(200).send(result);
    }
  );
}
