import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import type { EnvConfig } from '../config/env';
import type { IntegrationPlatform } from '@iexcel/shared-types';
import { MeetingType } from '@iexcel/shared-types';
import { ApiError } from '../errors/api-errors';
import { isValidUuid } from '../validators/transcript-validators';
import {
  ingestFromTextBodySchema,
  ingestFromUrlBodySchema,
} from '../validators/integration-validators';
import { ingestFromText, ingestFromPlatform } from '../services/transcript/ingest';
import { createLlmClient, type LlmClient } from '../services/transcript/enrichment';
import { getIntegration, getCredentials } from '../services/integrations/integration-service';
import { getConnector } from '../services/integrations/connectors/index';
import { eq } from 'drizzle-orm';
import { transcriptVersions } from '@iexcel/database/schema';
import type { WorkflowService } from '../services/workflow.service';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function invalidBodyError(message: string): ApiError {
  return new ApiError(400, 'INVALID_BODY', message);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

interface IngestRouteOptions {
  db: DbClient;
  config: EnvConfig;
  workflowService: WorkflowService;
}

/**
 * Registers transcript ingest routes.
 *
 * - POST /transcripts/ingest   — Ingest from platform URL
 * - POST /transcripts/parse    — Ingest from raw text
 * - GET  /transcripts/:id/versions — List versions
 */
export async function ingestRoutes(
  fastify: FastifyInstance,
  opts: IngestRouteOptions
): Promise<void> {
  const { db, config, workflowService } = opts;

  // Build LLM client if configured
  let llmClient: LlmClient | null = null;
  if (config.LLM_API_KEY) {
    llmClient = createLlmClient({
      apiKey: config.LLM_API_KEY,
      model: config.LLM_ENRICHMENT_MODEL,
      baseUrl: config.LLM_BASE_URL,
    });
  }

  // -----------------------------------------------------------------------
  // POST /transcripts/parse
  // -----------------------------------------------------------------------
  fastify.post(
    '/transcripts/parse',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const bodyResult = ingestFromTextBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw invalidBodyError(bodyResult.error.issues[0]?.message ?? 'Invalid body');
      }

      const { rawText, clientId, callType, callDate } = bodyResult.data;

      const result = await ingestFromText(
        db,
        {
          rawText,
          clientId,
          callType: callType as MeetingType,
          callDate,
        },
        llmClient
      );

      // Auto-trigger intake workflow when a client is associated
      if (clientId) {
        triggerIntakeAsync(workflowService, user.id, clientId, result.transcriptId, request);
      }

      void reply.status(201).send(result);
    }
  );

  // -----------------------------------------------------------------------
  // POST /transcripts/ingest
  // -----------------------------------------------------------------------
  fastify.post(
    '/transcripts/ingest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;

      const bodyResult = ingestFromUrlBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw invalidBodyError(bodyResult.error.issues[0]?.message ?? 'Invalid body');
      }

      const { integrationId, externalId, clientId } = bodyResult.data;

      // Look up the integration
      const integration = await getIntegration(db, integrationId);
      if (!integration) {
        throw new ApiError(404, 'INTEGRATION_NOT_FOUND', 'Integration not found.');
      }

      if (integration.userId !== user.id) {
        throw new ApiError(403, 'FORBIDDEN', 'You do not own this integration.');
      }

      if (integration.status !== 'connected') {
        throw new ApiError(
          422,
          'INTEGRATION_NOT_CONNECTED',
          `Integration is ${integration.status}. Please reconnect.`
        );
      }

      if (!config.INTEGRATION_ENCRYPTION_KEY) {
        throw new ApiError(500, 'CONFIGURATION_ERROR', 'Encryption key not configured.');
      }

      // Get decrypted credentials
      const credentials = await getCredentials(
        db,
        user.id,
        integration.platform as IntegrationPlatform,
        config.INTEGRATION_ENCRYPTION_KEY,
        user.role
      );

      if (!credentials) {
        throw new ApiError(422, 'CREDENTIALS_UNAVAILABLE', 'Unable to retrieve credentials.');
      }

      // Fetch transcript via connector
      const connector = getConnector(integration.platform as IntegrationPlatform);
      const { rawText, platformMeta } = await connector.fetchTranscript(
        credentials,
        externalId
      );

      // Ingest through the pipeline
      const result = await ingestFromPlatform(
        db,
        {
          rawText,
          clientId: clientId ?? null,
          callType: MeetingType.ClientCall,
          callDate: platformMeta.meetingDate ?? new Date().toISOString(),
          sourcePlatform: integration.platform,
          platformRecordingId: externalId,
        },
        llmClient
      );

      // Auto-trigger intake workflow when a client is associated
      if (clientId) {
        triggerIntakeAsync(workflowService, user.id, clientId, result.transcriptId, request);
      }

      void reply.status(201).send(result);
    }
  );

  // -----------------------------------------------------------------------
  // GET /transcripts/:id/versions
  // -----------------------------------------------------------------------
  fastify.get(
    '/transcripts/:id/versions',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      if (!isValidUuid(id)) {
        throw new ApiError(400, 'INVALID_ID', 'The provided ID is not a valid UUID.');
      }

      const versions = await db
        .select({
          id: transcriptVersions.id,
          transcriptId: transcriptVersions.transcriptId,
          version: transcriptVersions.version,
          format: transcriptVersions.format,
          enrichmentStatus: transcriptVersions.enrichmentStatus,
          summary: transcriptVersions.summary,
          highlights: transcriptVersions.highlights,
          actionItems: transcriptVersions.actionItems,
          createdAt: transcriptVersions.createdAt,
        })
        .from(transcriptVersions)
        .where(eq(transcriptVersions.transcriptId, id))
        .orderBy(transcriptVersions.version);

      const mapped = versions.map((v) => ({
        id: v.id,
        transcriptId: v.transcriptId,
        version: v.version,
        format: v.format,
        enrichmentStatus: v.enrichmentStatus,
        summary: v.summary,
        highlights: v.highlights,
        actionItems: v.actionItems,
        createdAt: v.createdAt.toISOString(),
      }));

      void reply.status(200).send({ versions: mapped });
    }
  );
}

// ---------------------------------------------------------------------------
// Auto-trigger intake workflow (fire-and-forget)
// ---------------------------------------------------------------------------

function triggerIntakeAsync(
  workflowService: WorkflowService,
  userId: string,
  clientId: string,
  transcriptId: string,
  request: FastifyRequest
): void {
  workflowService
    .triggerIntake(userId, clientId, transcriptId)
    .then((run) => {
      request.log.info(
        { workflowRunId: run.id, clientId, transcriptId },
        'Auto-triggered intake workflow after transcript ingest'
      );
    })
    .catch((err: unknown) => {
      // Non-fatal: conflict (already running) or other errors shouldn't fail the ingest
      request.log.warn(
        { clientId, transcriptId, error: String(err) },
        'Failed to auto-trigger intake workflow (non-fatal)'
      );
    });
}
