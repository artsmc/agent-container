import { eq, and, isNull, sql } from 'drizzle-orm';
import { deviceTokens, deviceSessions, users } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface DeviceTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  tokenPrefix: string;
  deviceFingerprint: string | null;
  label: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface DeviceSessionRow {
  id: string;
  deviceFingerprint: string;
  userCode: string;
  status: string;
  userId: string | null;
  tokenId: string | null;
  plaintextToken: string | null;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * User info returned alongside a validated device token.
 * Contains the fields needed to construct synthetic TokenClaims.
 */
export interface DeviceTokenUserInfo {
  tokenId: string;
  userId: string;
  authUserId: string;
  email: string;
  name: string;
  deviceFingerprint: string | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

// ---------------------------------------------------------------------------
// Device Token CRUD
// ---------------------------------------------------------------------------

export async function insertDeviceToken(
  db: DbClient,
  params: {
    userId: string;
    tokenHash: string;
    tokenPrefix: string;
    deviceFingerprint: string | null;
    label: string | null;
  }
): Promise<DeviceTokenRow> {
  const [row] = await db
    .insert(deviceTokens)
    .values({
      userId: params.userId,
      tokenHash: params.tokenHash,
      tokenPrefix: params.tokenPrefix,
      deviceFingerprint: params.deviceFingerprint,
      label: params.label,
    })
    .returning();
  return row as DeviceTokenRow;
}

/**
 * Finds a device token by its SHA-256 hash and joins the owning user record.
 * Returns combined token + user data needed for auth middleware.
 */
export async function findDeviceTokenByHash(
  db: DbClient,
  tokenHash: string
): Promise<DeviceTokenUserInfo | null> {
  const rows = await db
    .select({
      tokenId: deviceTokens.id,
      userId: deviceTokens.userId,
      authUserId: users.authUserId,
      email: users.email,
      name: users.name,
      deviceFingerprint: deviceTokens.deviceFingerprint,
      revokedAt: deviceTokens.revokedAt,
      expiresAt: deviceTokens.expiresAt,
    })
    .from(deviceTokens)
    .innerJoin(users, eq(deviceTokens.userId, users.id))
    .where(eq(deviceTokens.tokenHash, tokenHash))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Returns all non-revoked device tokens for a user.
 * Used by the token management UI to display active tokens.
 */
export async function findDeviceTokensByUser(
  db: DbClient,
  userId: string
): Promise<DeviceTokenRow[]> {
  const rows = await db
    .select()
    .from(deviceTokens)
    .where(
      and(
        eq(deviceTokens.userId, userId),
        isNull(deviceTokens.revokedAt)
      )
    );
  return rows as DeviceTokenRow[];
}

/**
 * Revokes a device token by setting revokedAt.
 * Only succeeds if the token belongs to the given user.
 */
export async function revokeDeviceToken(
  db: DbClient,
  tokenId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .update(deviceTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(deviceTokens.id, tokenId),
        eq(deviceTokens.userId, userId),
        isNull(deviceTokens.revokedAt)
      )
    )
    .returning({ id: deviceTokens.id });
  return result.length > 0;
}

/**
 * Updates the lastUsedAt timestamp for a device token.
 * Called fire-and-forget on each authenticated request.
 */
export async function updateDeviceTokenLastUsed(
  db: DbClient,
  tokenId: string
): Promise<void> {
  await db
    .update(deviceTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(deviceTokens.id, tokenId));
}

// ---------------------------------------------------------------------------
// Device Session CRUD
// ---------------------------------------------------------------------------

export async function insertDeviceSession(
  db: DbClient,
  params: {
    deviceFingerprint: string;
    userCode: string;
    expiresAt: Date;
  }
): Promise<DeviceSessionRow> {
  const [row] = await db
    .insert(deviceSessions)
    .values({
      deviceFingerprint: params.deviceFingerprint,
      userCode: params.userCode,
      expiresAt: params.expiresAt,
    })
    .returning();
  return row as DeviceSessionRow;
}

export async function findDeviceSessionById(
  db: DbClient,
  sessionId: string
): Promise<DeviceSessionRow | null> {
  const rows = await db
    .select()
    .from(deviceSessions)
    .where(eq(deviceSessions.id, sessionId))
    .limit(1);
  return (rows[0] as DeviceSessionRow) ?? null;
}

/**
 * Atomically marks a device session as complete after the user approves.
 * Stores the userId, tokenId, and temporary plaintext token.
 * Only succeeds if the session is still in 'pending' status, preventing
 * TOCTOU race conditions where two concurrent approvals both succeed.
 *
 * @returns true if the update was applied, false if the session was no longer pending
 */
export async function updateDeviceSessionComplete(
  db: DbClient,
  sessionId: string,
  userId: string,
  tokenId: string,
  plaintextToken: string
): Promise<boolean> {
  const result = await db
    .update(deviceSessions)
    .set({
      status: 'complete',
      userId,
      tokenId,
      plaintextToken,
    })
    .where(
      and(
        eq(deviceSessions.id, sessionId),
        sql`${deviceSessions.status} = 'pending'`
      )
    )
    .returning({ id: deviceSessions.id });

  return result.length > 0;
}

/**
 * Marks a device session as expired.
 */
export async function updateDeviceSessionExpired(
  db: DbClient,
  sessionId: string
): Promise<void> {
  await db
    .update(deviceSessions)
    .set({ status: 'expired' })
    .where(eq(deviceSessions.id, sessionId));
}

/**
 * Atomically reads and clears the plaintext token from a completed session.
 * Returns the token if it was present, or null if already cleared.
 * This prevents race conditions where concurrent poll requests could both
 * retrieve the token.
 */
export async function claimDeviceSessionPlaintextToken(
  db: DbClient,
  sessionId: string
): Promise<string | null> {
  const rows = await db
    .update(deviceSessions)
    .set({ plaintextToken: sql`NULL` })
    .where(
      and(
        eq(deviceSessions.id, sessionId),
        sql`${deviceSessions.plaintextToken} IS NOT NULL`
      )
    )
    .returning({ plaintextToken: deviceSessions.plaintextToken });

  return rows[0]?.plaintextToken ?? null;
}
