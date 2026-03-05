/**
 * Session service: create sessions, revoke sessions.
 */
import {
  createSession as dbCreateSession,
  deleteSessionsByUserId,
} from '../db/sessions.js';
import { revokeAllRefreshTokensForUser } from '../db/tokens.js';
import type { SessionRow } from '../types.js';

const SESSION_LIFETIME_DAYS = 30;

export async function createSession(params: {
  userId: string;
  idpSessionId: string | null;
}): Promise<SessionRow> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_LIFETIME_DAYS);

  return dbCreateSession({
    userId: params.userId,
    idpSessionId: params.idpSessionId,
    expiresAt,
  });
}

export async function revokeAllUserSessions(
  userId: string
): Promise<{ sessionsRevoked: number; refreshTokensRevoked: number }> {
  const sessionsRevoked = await deleteSessionsByUserId(userId);
  const refreshTokensRevoked = await revokeAllRefreshTokensForUser(userId);
  return { sessionsRevoked, refreshTokensRevoked };
}
