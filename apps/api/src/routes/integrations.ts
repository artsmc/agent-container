import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import type { EnvConfig } from '../config/env';
import type { IntegrationPlatform } from '@iexcel/shared-types';
import { ApiError } from '../errors/api-errors';
import {
  isValidPlatform,
  completeSessionBodySchema,
  connectIntegrationBodySchema,
} from '../validators/integration-validators';
import {
  listIntegrations,
  getIntegration,
  initSession,
  completeSession,
  connectIntegration,
  disconnectIntegration,
} from '../services/integrations/integration-service';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function invalidPlatformError(): ApiError {
  return new ApiError(400, 'INVALID_PLATFORM', 'Platform must be one of: fireflies, grain.');
}

function invalidBodyError(message: string): ApiError {
  return new ApiError(400, 'INVALID_BODY', message);
}

function encryptionKeyMissingError(): ApiError {
  return new ApiError(500, 'CONFIGURATION_ERROR', 'Integration encryption key is not configured.');
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

interface IntegrationRouteOptions {
  db: DbClient;
  config: EnvConfig;
}

/**
 * Registers integration management routes.
 *
 * All routes run inside the protected scope (authenticate + loadUser hooks).
 *
 * - GET    /integrations                     - List user's integrations
 * - POST   /integrations/:platform/connect   - Connect (or reconnect) an integration
 * - POST   /integrations/:platform/init      - Start credential session
 * - POST   /integrations/:platform/complete  - Complete credential session
 * - POST   /integrations/:platform/disconnect - Disconnect integration
 */
export async function integrationRoutes(
  fastify: FastifyInstance,
  opts: IntegrationRouteOptions
): Promise<void> {
  const { db, config } = opts;

  // -----------------------------------------------------------------------
  // GET /integrations
  // -----------------------------------------------------------------------
  fastify.get(
    '/integrations',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const integrations = await listIntegrations(db, user.id);
      void reply.status(200).send({ integrations });
    }
  );

  // -----------------------------------------------------------------------
  // POST /integrations/:platform/connect
  // -----------------------------------------------------------------------
  fastify.post(
    '/integrations/:platform/connect',
    async (
      request: FastifyRequest<{ Params: { platform: string } }>,
      reply: FastifyReply
    ) => {
      const { platform } = request.params;
      const user = request.user!;

      if (!isValidPlatform(platform)) {
        throw invalidPlatformError();
      }

      if (!config.INTEGRATION_ENCRYPTION_KEY) {
        throw encryptionKeyMissingError();
      }

      const bodyResult = connectIntegrationBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw invalidBodyError(bodyResult.error.issues[0]?.message ?? 'Invalid body');
      }

      const { apiKey, authorizationCode, label } = bodyResult.data;

      // Build credentials object based on platform
      const credentials: Record<string, unknown> = {};
      if (platform === 'fireflies') {
        if (!apiKey) {
          throw invalidBodyError('apiKey is required for Fireflies');
        }
        credentials['apiKey'] = apiKey;
      } else if (platform === 'grain') {
        if (!authorizationCode) {
          throw invalidBodyError('authorizationCode is required for Grain');
        }
        credentials['authorizationCode'] = authorizationCode;
      }

      const integration = await connectIntegration(
        db,
        user.id,
        platform as IntegrationPlatform,
        config.INTEGRATION_ENCRYPTION_KEY,
        credentials,
        { label }
      );

      void reply.status(201).send({ integration });
    }
  );

  // -----------------------------------------------------------------------
  // POST /integrations/:platform/init
  // -----------------------------------------------------------------------
  fastify.post(
    '/integrations/:platform/init',
    async (
      request: FastifyRequest<{ Params: { platform: string } }>,
      reply: FastifyReply
    ) => {
      const { platform } = request.params;
      const user = request.user!;

      if (!isValidPlatform(platform)) {
        throw invalidPlatformError();
      }

      const session = await initSession(db, user.id, platform as IntegrationPlatform);

      // Construct browser URL for credential entry
      const baseUrl = config.APP_BASE_URL ?? `http://localhost:3500`;
      const browserUrl = `${baseUrl}/connect/${platform}?session=${session.sessionId}`;

      void reply.status(201).send({
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        browserUrl,
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /integrations/:platform/complete
  // -----------------------------------------------------------------------
  fastify.post(
    '/integrations/:platform/complete',
    async (
      request: FastifyRequest<{ Params: { platform: string } }>,
      reply: FastifyReply
    ) => {
      const { platform } = request.params;

      if (!isValidPlatform(platform)) {
        throw invalidPlatformError();
      }

      if (!config.INTEGRATION_ENCRYPTION_KEY) {
        throw encryptionKeyMissingError();
      }

      const bodyResult = completeSessionBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw invalidBodyError(bodyResult.error.issues[0]?.message ?? 'Invalid body');
      }

      const { sessionId, apiKey, authorizationCode, label } = bodyResult.data;

      const credentials: Record<string, unknown> = {};
      if (apiKey) credentials['apiKey'] = apiKey;
      if (authorizationCode) credentials['authorizationCode'] = authorizationCode;

      try {
        const integration = await completeSession(
          db,
          sessionId,
          config.INTEGRATION_ENCRYPTION_KEY,
          credentials,
          { label: label ?? undefined }
        );

        void reply.status(200).send({ integration });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('expired')) {
            throw new ApiError(410, 'SESSION_EXPIRED', 'The credential session has expired.');
          }
          if (error.message.includes('not found')) {
            throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found.');
          }
          if (error.message.includes('no longer pending')) {
            throw new ApiError(409, 'SESSION_ALREADY_COMPLETED', 'Session already completed.');
          }
        }
        throw error;
      }
    }
  );

  // -----------------------------------------------------------------------
  // POST /integrations/:platform/disconnect
  // -----------------------------------------------------------------------
  fastify.post(
    '/integrations/:platform/disconnect',
    async (
      request: FastifyRequest<{ Params: { platform: string } }>,
      reply: FastifyReply
    ) => {
      const { platform } = request.params;
      const user = request.user!;

      if (!isValidPlatform(platform)) {
        throw invalidPlatformError();
      }

      const disconnected = await disconnectIntegration(
        db,
        user.id,
        platform as IntegrationPlatform
      );

      if (!disconnected) {
        throw new ApiError(404, 'INTEGRATION_NOT_FOUND', 'No integration found for this platform.');
      }

      void reply.status(200).send({ success: true });
    }
  );
}
