import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import type { RequestUser } from '../types/request';

/**
 * Builds a Fastify preHandler hook that resolves the product user
 * from the validated token claims.
 *
 * - Looks up the user by `tokenClaims.sub` (mapped to `auth_user_id`).
 * - If the user does not exist, performs just-in-time (JIT) provisioning
 *   with the default role `team_member`.
 * - If the user's email or name has changed (e.g., SSO profile update),
 *   the record is updated.
 * - Sets `request.user` with the resolved `RequestUser`.
 *
 * @param db - Drizzle database client
 */
export function buildUserLoader(db: DbClient) {
  return async function loadUserHook(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    const claims = request.tokenClaims;
    if (!claims) {
      // This should never happen if authenticate middleware ran first,
      // but guard defensively.
      throw new Error('tokenClaims not set on request. Is authenticate middleware registered?');
    }

    const authUserId = claims.sub;
    const email = claims.email ?? '';
    const name = claims.name ?? '';

    // Attempt to find existing user
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, authUserId))
      .limit(1);

    let userRecord = existingUsers[0];

    if (!userRecord) {
      // Determine role: service accounts (client_credentials) get admin
      const mastraClientId = process.env['MASTRA_CLIENT_ID'] ?? 'mastra-agent';
      const isServiceAccount = authUserId === mastraClientId;
      const defaultRole = isServiceAccount ? 'admin' : 'team_member';

      // JIT provisioning: upsert to handle concurrent requests
      const inserted = await db
        .insert(users)
        .values({
          authUserId,
          email,
          name,
          role: defaultRole,
        })
        .onConflictDoUpdate({
          target: users.authUserId,
          set: { email, name, updatedAt: new Date() },
        })
        .returning();

      userRecord = inserted[0];
    } else if (userRecord.email !== email || userRecord.name !== name) {
      // Sync profile changes from the identity provider
      const updated = await db
        .update(users)
        .set({
          email,
          name,
          updatedAt: new Date(),
        })
        .where(eq(users.authUserId, authUserId))
        .returning();

      userRecord = updated[0] ?? userRecord;
    }

    if (!userRecord) {
      throw new Error('Failed to resolve or provision user record');
    }

    request.user = {
      id: userRecord.id,
      authUserId: userRecord.authUserId,
      email: userRecord.email,
      name: userRecord.name,
      role: userRecord.role,
    } satisfies RequestUser;
  };
}
