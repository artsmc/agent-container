import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import type { EnvConfig } from '../config/env';
import { ApiError } from '../errors/api-errors';
import {
  completeSessionBodySchema,
  isValidPlatform,
} from '../validators/integration-validators';
import { completeSession } from '../services/integrations/integration-service';
import { findSessionById } from '../repositories/integration-repository';

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

interface ConnectSessionRouteOptions {
  db: DbClient;
  config: EnvConfig;
}

/**
 * Registers public connect-session routes.
 *
 * These routes are registered on the PUBLIC router (no JWT middleware).
 * Authentication is not required — the session ID itself acts as
 * an opaque bearer token and is time-limited (5 minutes).
 *
 * - GET  /connect/:platform/session/:sessionId — Check session status
 * - POST /connect/:platform/complete           — Complete credential session
 */
export async function connectSessionRoutes(
  fastify: FastifyInstance,
  opts: ConnectSessionRouteOptions
): Promise<void> {
  const { db, config } = opts;

  // -----------------------------------------------------------------------
  // GET /connect/:platform/session/:sessionId
  // -----------------------------------------------------------------------
  fastify.get(
    '/connect/:platform/session/:sessionId',
    async (
      request: FastifyRequest<{
        Params: { platform: string; sessionId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { platform, sessionId } = request.params;

      if (!isValidPlatform(platform)) {
        throw invalidPlatformError();
      }

      const session = await findSessionById(db, sessionId);

      if (!session) {
        throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found.');
      }

      // Verify the session belongs to the requested platform
      if (session.platform !== platform) {
        throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found.');
      }

      // Determine effective status (check expiry for pending sessions)
      let effectiveStatus = session.status;
      if (session.status === 'pending' && new Date() > session.expiresAt) {
        effectiveStatus = 'expired';
      }

      void reply.status(200).send({
        sessionId: session.id,
        platform: session.platform,
        status: effectiveStatus,
        expiresAt: session.expiresAt.toISOString(),
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /connect/:platform/complete
  // -----------------------------------------------------------------------
  fastify.post(
    '/connect/:platform/complete',
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
}
