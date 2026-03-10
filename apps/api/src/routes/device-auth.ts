import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client';
import type { EnvConfig } from '../config/env';
import { ApiError } from '../errors/api-errors';
import {
  initDeviceSessionSchema,
  approveDeviceSessionSchema,
} from '../validators/device-auth-validators';
import {
  initDeviceSession,
  approveDeviceSession,
  getDeviceSession,
  listUserTokens,
  revokeToken,
} from '../services/device-token-service';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

function invalidBodyError(message: string): ApiError {
  return new ApiError(400, 'INVALID_BODY', message);
}

// ---------------------------------------------------------------------------
// Public routes (no JWT middleware)
// ---------------------------------------------------------------------------

interface DeviceAuthPublicRouteOptions {
  db: DbClient;
  config: EnvConfig;
}

/**
 * Registers public device-auth routes.
 *
 * These routes are on the public router (no JWT middleware).
 * The session ID acts as an opaque secret and is time-limited (5 minutes).
 *
 * - POST /auth/device/init              — Start device auth session
 * - GET  /auth/device/session/:sessionId — Poll session status
 */
export async function deviceAuthPublicRoutes(
  fastify: FastifyInstance,
  opts: DeviceAuthPublicRouteOptions
): Promise<void> {
  const { db, config } = opts;

  // -----------------------------------------------------------------------
  // POST /auth/device/init
  // -----------------------------------------------------------------------
  fastify.post(
    '/auth/device/init',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodyResult = initDeviceSessionSchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw invalidBodyError(
          bodyResult.error.issues[0]?.message ?? 'Invalid body'
        );
      }

      const { fingerprint } = bodyResult.data;
      const result = await initDeviceSession(db, fingerprint);

      // Construct the browser login URL
      const baseUrl = config.APP_BASE_URL ?? 'http://localhost:3500';
      const loginUrl = `${baseUrl}/auth/device?session=${result.sessionId}`;

      void reply.status(201).send({
        sessionId: result.sessionId,
        loginUrl,
        userCode: result.userCode,
        expiresAt: result.expiresAt,
      });
    }
  );

  // -----------------------------------------------------------------------
  // GET /auth/device/session/:sessionId
  // -----------------------------------------------------------------------
  fastify.get(
    '/auth/device/session/:sessionId',
    async (
      request: FastifyRequest<{
        Params: { sessionId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { sessionId } = request.params;

      const session = await getDeviceSession(db, sessionId);

      if (!session) {
        throw new ApiError(
          404,
          'SESSION_NOT_FOUND',
          'Device session not found.'
        );
      }

      void reply.status(200).send(session);
    }
  );
}

// ---------------------------------------------------------------------------
// Protected routes (requires JWT auth)
// ---------------------------------------------------------------------------

interface DeviceAuthProtectedRouteOptions {
  db: DbClient;
}

/**
 * Registers protected device-auth routes.
 *
 * All routes run inside the protected scope (authenticate + loadUser hooks).
 *
 * - POST   /auth/device/approve — Approve a device session (generate token)
 * - GET    /auth/tokens         — List user's device tokens
 * - DELETE /auth/tokens/:id     — Revoke a device token
 */
export async function deviceAuthProtectedRoutes(
  fastify: FastifyInstance,
  opts: DeviceAuthProtectedRouteOptions
): Promise<void> {
  const { db } = opts;

  // -----------------------------------------------------------------------
  // POST /auth/device/approve
  // -----------------------------------------------------------------------
  fastify.post(
    '/auth/device/approve',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodyResult = approveDeviceSessionSchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw invalidBodyError(
          bodyResult.error.issues[0]?.message ?? 'Invalid body'
        );
      }

      const { sessionId, label } = bodyResult.data;
      const user = request.user!;

      try {
        const result = await approveDeviceSession(db, sessionId, user.id, label);
        void reply.status(201).send(result);
      } catch (error) {
        // Re-throw ApiErrors (they already have proper status codes)
        if (error instanceof ApiError) {
          throw error;
        }
        throw error;
      }
    }
  );

  // -----------------------------------------------------------------------
  // GET /auth/tokens
  // -----------------------------------------------------------------------
  fastify.get(
    '/auth/tokens',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const tokens = await listUserTokens(db, user.id);
      void reply.status(200).send({ tokens });
    }
  );

  // -----------------------------------------------------------------------
  // DELETE /auth/tokens/:id
  // -----------------------------------------------------------------------
  fastify.delete(
    '/auth/tokens/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const user = request.user!;

      const revoked = await revokeToken(db, id, user.id);

      if (!revoked) {
        throw new ApiError(
          404,
          'TOKEN_NOT_FOUND',
          'Token not found or already revoked.'
        );
      }

      void reply.status(200).send({ success: true });
    }
  );
}
