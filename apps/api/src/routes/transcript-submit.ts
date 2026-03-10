import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import type { EnvConfig } from '../config/env';
import type { IntegrationPlatform } from '@iexcel/shared-types';
import { MeetingType } from '@iexcel/shared-types';
import { ApiError } from '../errors/api-errors';
import {
  isValidPlatform,
  importFromPlatformBodySchema,
  importFromUrlBodySchema,
} from '../validators/integration-validators';
import { getCredentials } from '../services/integrations/integration-service';
import { getConnector } from '../services/integrations/connectors/index';
import { ingestFromPlatform } from '../services/transcript/ingest';
import { createLlmClient, type LlmClient } from '../services/transcript/enrichment';
import {
  detectPlatformFromUrl,
  extractRecordingId,
} from '../services/transcript/url-detector';
import type { WorkflowService } from '../services/workflow.service';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function invalidBodyError(message: string): ApiError {
  return new ApiError(400, 'INVALID_BODY', message);
}

function encryptionKeyMissingError(): ApiError {
  return new ApiError(500, 'CONFIGURATION_ERROR', 'Integration encryption key is not configured.');
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

interface TranscriptSubmitRouteOptions {
  db: DbClient;
  config: EnvConfig;
  workflowService: WorkflowService;
}

/**
 * Registers transcript submission routes for platform import and URL-based import.
 *
 * Routes:
 * - GET  /transcripts/available?platform=xxx  — List recordings from connected platform
 * - POST /transcripts/import                  — Batch import from platform
 * - POST /transcripts/from-url                — Auto-detect platform from URL and import
 */
export async function transcriptSubmitRoutes(
  fastify: FastifyInstance,
  opts: TranscriptSubmitRouteOptions
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
  // GET /transcripts/available?platform=fireflies|grain
  // -----------------------------------------------------------------------
  fastify.get(
    '/transcripts/available',
    async (
      request: FastifyRequest<{ Querystring: { platform?: string } }>,
      reply: FastifyReply
    ) => {
      const user = request.user!;
      const { platform } = request.query;

      if (!platform || !isValidPlatform(platform)) {
        throw new ApiError(
          400,
          'INVALID_PLATFORM',
          'Query parameter "platform" must be one of: fireflies, grain.'
        );
      }

      if (!config.INTEGRATION_ENCRYPTION_KEY) {
        throw encryptionKeyMissingError();
      }

      // Get decrypted credentials for the user's integration
      const credentials = await getCredentials(
        db,
        user.id,
        platform as IntegrationPlatform,
        config.INTEGRATION_ENCRYPTION_KEY,
        user.role
      );

      if (!credentials) {
        throw new ApiError(
          404,
          'INTEGRATION_NOT_CONNECTED',
          `No connected ${platform} integration found. Please connect ${platform} first.`
        );
      }

      // Fetch recordings list from the platform
      const connector = getConnector(platform as IntegrationPlatform);
      const recordings = await connector.listRecordings(credentials);

      void reply.status(200).send({ recordings });
    }
  );

  // -----------------------------------------------------------------------
  // POST /transcripts/import
  // -----------------------------------------------------------------------
  fastify.post(
    '/transcripts/import',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;

      const bodyResult = importFromPlatformBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw invalidBodyError(bodyResult.error.issues[0]?.message ?? 'Invalid body');
      }

      const { platform, recordingIds, clientId, meetingType } = bodyResult.data;

      if (!config.INTEGRATION_ENCRYPTION_KEY) {
        throw encryptionKeyMissingError();
      }

      // Get decrypted credentials
      const credentials = await getCredentials(
        db,
        user.id,
        platform as IntegrationPlatform,
        config.INTEGRATION_ENCRYPTION_KEY,
        user.role
      );

      if (!credentials) {
        throw new ApiError(
          404,
          'INTEGRATION_NOT_CONNECTED',
          `No connected ${platform} integration found.`
        );
      }

      const connector = getConnector(platform as IntegrationPlatform);
      const results = [];

      for (const recordingId of recordingIds) {
        try {
          const { rawText, platformMeta } = await connector.fetchTranscript(
            credentials,
            recordingId
          );

          const result = await ingestFromPlatform(
            db,
            {
              rawText,
              clientId: clientId ?? null,
              callType: (meetingType as MeetingType) ?? MeetingType.ClientCall,
              callDate: platformMeta.meetingDate ?? new Date().toISOString(),
              sourcePlatform: platform,
              platformRecordingId: recordingId,
            },
            llmClient
          );

          results.push({
            recordingId,
            success: true,
            transcriptId: result.transcriptId,
            versionId: result.versionId,
          });

          // Auto-trigger intake workflow for each successfully imported transcript with a client
          if (clientId) {
            triggerIntakeAsync(workflowService, user.id, clientId, result.transcriptId, request);
          }
        } catch (err) {
          results.push({
            recordingId,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      void reply.status(201).send({ results });
    }
  );

  // -----------------------------------------------------------------------
  // POST /transcripts/from-url
  // -----------------------------------------------------------------------
  fastify.post(
    '/transcripts/from-url',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;

      const bodyResult = importFromUrlBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw invalidBodyError(bodyResult.error.issues[0]?.message ?? 'Invalid body');
      }

      const { url, clientId, meetingType } = bodyResult.data;

      // Detect platform from URL
      const platform = detectPlatformFromUrl(url);
      if (!platform) {
        throw new ApiError(
          400,
          'UNRECOGNIZED_URL',
          'Could not detect a supported platform from the provided URL. Supported: Fireflies, Grain.'
        );
      }

      // Extract recording ID
      const recordingId = extractRecordingId(url, platform);
      if (!recordingId) {
        throw new ApiError(
          400,
          'INVALID_URL',
          'Could not extract a recording ID from the provided URL.'
        );
      }

      if (!config.INTEGRATION_ENCRYPTION_KEY) {
        throw encryptionKeyMissingError();
      }

      // Get decrypted credentials
      const credentials = await getCredentials(
        db,
        user.id,
        platform as IntegrationPlatform,
        config.INTEGRATION_ENCRYPTION_KEY,
        user.role
      );

      if (!credentials) {
        throw new ApiError(
          404,
          'INTEGRATION_NOT_CONNECTED',
          `No connected ${platform} integration found. Please connect ${platform} in Settings > Integrations first.`
        );
      }

      // Fetch transcript via connector
      const connector = getConnector(platform as IntegrationPlatform);
      const { rawText, platformMeta } = await connector.fetchTranscript(
        credentials,
        recordingId
      );

      // Ingest through the pipeline
      const result = await ingestFromPlatform(
        db,
        {
          rawText,
          clientId: clientId ?? null,
          callType: (meetingType as MeetingType) ?? MeetingType.ClientCall,
          callDate: platformMeta.meetingDate ?? new Date().toISOString(),
          sourcePlatform: platform,
          platformRecordingId: recordingId,
        },
        llmClient
      );

      // Auto-trigger intake workflow when a client is associated
      if (clientId) {
        triggerIntakeAsync(workflowService, user.id, clientId, result.transcriptId, request);
      }

      void reply.status(201).send({
        ...result,
        detectedPlatform: platform,
        recordingId,
      });
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
      request.log.warn(
        { clientId, transcriptId, error: String(err) },
        'Failed to auto-trigger intake workflow (non-fatal)'
      );
    });
}
