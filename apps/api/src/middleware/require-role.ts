import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../errors/api-errors';
import type { RequestUser } from '../types/request';

type UserRole = RequestUser['role'];

/**
 * Creates a Fastify preHandler hook that enforces role-based access control.
 *
 * The `admin` role always passes regardless of the allowed list.
 * If the user's role is not in the allowed list and is not `admin`,
 * a `ForbiddenError` is thrown.
 *
 * @param roles - One or more roles that are permitted to access the route
 *
 * @example
 * ```ts
 * fastify.delete('/clients/:id', {
 *   preHandler: requireRole('admin', 'account_manager'),
 *   handler: deleteClientHandler,
 * });
 * ```
 */
export function requireRole(...roles: UserRole[]) {
  return async function requireRoleHook(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const user = request.user;

    if (!user) {
      throw new ForbiddenError('User context not available');
    }

    // Admin always passes
    if (user.role === 'admin') {
      return;
    }

    if (!roles.includes(user.role)) {
      throw new ForbiddenError(
        `Role '${user.role}' is not permitted for this action`
      );
    }
  };
}
