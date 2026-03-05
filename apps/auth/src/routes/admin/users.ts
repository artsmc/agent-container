/**
 * Admin endpoints for user management.
 * All endpoints require admin scope.
 *
 * GET    /admin/users            - List all users
 * GET    /admin/users/:id        - Get user detail
 * POST   /admin/users/:id/deactivate - Deactivate a user
 * DELETE /admin/users/:id/sessions   - Revoke all sessions for a user
 */
import type { FastifyInstance } from 'fastify';
import { listUsers, getUserById, setUserActive } from '../../db/users.js';
import { countActiveSessionsForUser } from '../../db/sessions.js';
import { countActiveRefreshTokensForUser } from '../../db/tokens.js';
import { revokeAllUserSessions } from '../../services/session.js';
import { createAuthHook } from '../../middleware/auth.js';
import { createAdminHook } from '../../middleware/admin.js';
import type { UserSummary, UserDetailResponse } from '../../types.js';

interface ListUsersQuery {
  is_active?: string;
  limit?: string;
  offset?: string;
}

export function registerAdminUserRoutes(
  app: FastifyInstance,
  issuerUrl: string,
  audience: string,
  adminScope: string
): void {
  const authHook = createAuthHook(issuerUrl, audience);
  const adminHook = createAdminHook(adminScope);

  // GET /admin/users
  app.get<{ Querystring: ListUsersQuery }>(
    '/admin/users',
    { onRequest: [authHook, adminHook] },
    async (request, reply) => {
      const { is_active, limit: limitStr, offset: offsetStr } = request.query;

      let isActive: boolean | undefined;
      if (is_active === 'true') isActive = true;
      else if (is_active === 'false') isActive = false;

      let limit = parseInt(limitStr ?? '50', 10);
      if (isNaN(limit) || limit <= 0) limit = 50;
      if (limit > 200) limit = 200;

      let offset = parseInt(offsetStr ?? '0', 10);
      if (isNaN(offset) || offset < 0) offset = 0;

      const result = await listUsers({ isActive, limit, offset });

      const users: UserSummary[] = result.users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        idp_provider: u.idp_provider,
        is_active: u.is_active,
        created_at: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at),
        last_login_at: u.last_login_at
          ? u.last_login_at instanceof Date
            ? u.last_login_at.toISOString()
            : String(u.last_login_at)
          : null,
      }));

      return reply.status(200).send({ users, total: result.total });
    }
  );

  // GET /admin/users/:id
  app.get<{ Params: { id: string } }>(
    '/admin/users/:id',
    { onRequest: [authHook, adminHook] },
    async (request, reply) => {
      const user = await getUserById(request.params.id);
      if (!user) {
        return reply.status(404).send({
          error: 'not_found',
          error_description: 'User not found.',
        });
      }

      const activeSessions = await countActiveSessionsForUser(user.id);
      const activeRefreshTokens = await countActiveRefreshTokensForUser(user.id);

      const detail: UserDetailResponse = {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        idp_provider: user.idp_provider,
        idp_subject: user.idp_subject,
        is_active: user.is_active,
        created_at: user.created_at instanceof Date ? user.created_at.toISOString() : String(user.created_at),
        updated_at: user.updated_at instanceof Date ? user.updated_at.toISOString() : String(user.updated_at),
        last_login_at: user.last_login_at
          ? user.last_login_at instanceof Date
            ? user.last_login_at.toISOString()
            : String(user.last_login_at)
          : null,
        active_sessions: activeSessions,
        active_refresh_tokens: activeRefreshTokens,
      };

      return reply.status(200).send(detail);
    }
  );

  // POST /admin/users/:id/deactivate
  app.post<{ Params: { id: string } }>(
    '/admin/users/:id/deactivate',
    { onRequest: [authHook, adminHook] },
    async (request, reply) => {
      const user = await getUserById(request.params.id);
      if (!user) {
        return reply.status(404).send({
          error: 'not_found',
          error_description: 'User not found.',
        });
      }

      await setUserActive(request.params.id, false);
      return reply.status(200).send({
        deactivated: true,
        user_id: user.id,
      });
    }
  );

  // DELETE /admin/users/:id/sessions
  app.delete<{ Params: { id: string } }>(
    '/admin/users/:id/sessions',
    { onRequest: [authHook, adminHook] },
    async (request, reply) => {
      const user = await getUserById(request.params.id);
      if (!user) {
        return reply.status(404).send({
          error: 'not_found',
          error_description: 'User not found.',
        });
      }

      const result = await revokeAllUserSessions(request.params.id);
      return reply.status(200).send({
        sessions_revoked: result.sessionsRevoked,
        refresh_tokens_revoked: result.refreshTokensRevoked,
      });
    }
  );
}
