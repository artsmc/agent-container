import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import type { EnvConfig } from '../config/env';
import type { IntegrationPlatform } from '@iexcel/shared-types';
import { MeetingType } from '@iexcel/shared-types';
import { isValidPlatform } from '../validators/integration-validators';
import {
  getCredentials,
} from '../services/integrations/integration-service';
import { findIntegrationByWebhookId } from '../repositories/integration-repository';
import { updateIntegrationLastSync } from '../repositories/integration-repository';
import { getConnector } from '../services/integrations/connectors/index';
import { ingestFromPlatform } from '../services/transcript/ingest';
import { createLlmClient, type LlmClient } from '../services/transcript/enrichment';
import {
  verifyHmacSignature,
  WEBHOOK_SIGNATURE_HEADERS,
} from '../utils/webhook-signature';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

interface WebhookRouteOptions {
  db: DbClient;
  config: EnvConfig;
}

/**
 * Registers webhook receiver routes.
 *
 * These routes are PUBLIC (no JWT auth) -- they verify platform-specific
 * HMAC webhook signatures instead.
 *
 * - POST /webhooks/:platform/:webhookId - Receive platform webhook
 */
export async function webhookRoutes(
  fastify: FastifyInstance,
  opts: WebhookRouteOptions
): Promise<void> {
  const { db, config } = opts;

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
  // POST /webhooks/:platform/:webhookId
  // -----------------------------------------------------------------------
  fastify.post(
    '/webhooks/:platform/:webhookId',
    async (
      request: FastifyRequest<{
        Params: { platform: string; webhookId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { platform, webhookId } = request.params;

      // Validate platform
      if (!isValidPlatform(platform)) {
        void reply.status(400).send({ error: 'Invalid platform' });
        return;
      }

      // Verify HMAC signature
      if (!config.WEBHOOK_SIGNING_SECRET) {
        request.log.error('WEBHOOK_SIGNING_SECRET not set, rejecting webhook');
        void reply.status(500).send({ error: 'Webhook verification not configured' });
        return;
      }

      const signatureHeader = WEBHOOK_SIGNATURE_HEADERS[platform];
      const signature = signatureHeader
        ? (request.headers[signatureHeader] as string | undefined)
        : undefined;

      if (!signature) {
        void reply.status(401).send({ error: 'Missing signature' });
        return;
      }

      const rawBody = JSON.stringify(request.body);
      const isValid = verifyHmacSignature(
        rawBody,
        signature,
        config.WEBHOOK_SIGNING_SECRET
      );

      if (!isValid) {
        void reply.status(401).send({ error: 'Invalid signature' });
        return;
      }

      // Look up integration by opaque webhookId
      const integration = await findIntegrationByWebhookId(db, webhookId);

      if (!integration || integration.status !== 'connected') {
        // Accept silently to avoid platform retries
        void reply.status(200).send({ status: 'ignored' });
        return;
      }

      if (integration.platform !== platform) {
        void reply.status(200).send({ status: 'ignored', reason: 'platform mismatch' });
        return;
      }

      const body = request.body as Record<string, unknown>;

      // Extract recording ID based on platform
      let externalId: string | null = null;
      if (platform === 'fireflies') {
        externalId = (body['meetingId'] ?? body['transcript_id'] ?? body['id']) as string;
      } else if (platform === 'grain') {
        const recording = body['recording'] as Record<string, unknown> | undefined;
        externalId = (recording?.['id'] ?? body['recording_id'] ?? body['id']) as string;
      }

      if (!externalId) {
        void reply.status(200).send({ status: 'skipped', reason: 'no recording ID' });
        return;
      }

      if (!config.INTEGRATION_ENCRYPTION_KEY) {
        request.log.error('INTEGRATION_ENCRYPTION_KEY not set, cannot process webhook');
        void reply.status(200).send({ status: 'error' });
        return;
      }

      // Fetch transcript via connector (fire-and-forget for webhook processing)
      try {
        const credentials = await getCredentials(
          db,
          integration.userId,
          platform as IntegrationPlatform,
          config.INTEGRATION_ENCRYPTION_KEY
        );

        if (!credentials) {
          void reply.status(200).send({ status: 'ignored', reason: 'no credentials' });
          return;
        }

        const connector = getConnector(platform as IntegrationPlatform);
        const { rawText, platformMeta } = await connector.fetchTranscript(
          credentials,
          externalId
        );

        // Auto-ingest: clientId is null (unmatched), will be flagged
        await ingestFromPlatform(
          db,
          {
            rawText,
            clientId: null,
            callType: MeetingType.ClientCall,
            callDate: platformMeta.meetingDate ?? new Date().toISOString(),
            sourcePlatform: platform,
            platformRecordingId: externalId,
          },
          llmClient
        );

        // Update last sync timestamp
        await updateIntegrationLastSync(db, integration.id);

        void reply.status(200).send({ status: 'ingested' });
      } catch (error) {
        request.log.error(
          { error, platform, webhookId, externalId },
          'Webhook transcript ingest failed'
        );
        // Return 200 to prevent platform retries
        void reply.status(200).send({ status: 'error' });
      }
    }
  );
}
