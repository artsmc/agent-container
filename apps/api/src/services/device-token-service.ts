import type { DbClient } from '../db/client';
import {
  generateToken,
  hashToken,
  generateUserCode,
  hashFingerprint,
} from '../utils/device-token';
import {
  insertDeviceToken,
  findDeviceTokenByHash,
  findDeviceTokensByUser,
  revokeDeviceToken as repoRevokeDeviceToken,
  updateDeviceTokenLastUsed,
  insertDeviceSession,
  findDeviceSessionById,
  updateDeviceSessionComplete,
  updateDeviceSessionExpired,
  claimDeviceSessionPlaintextToken,
  type DeviceTokenRow,
  type DeviceTokenUserInfo,
} from '../repositories/device-token-repository';
import { ApiError } from '../errors/api-errors';

/** Session TTL: 5 minutes. */
const SESSION_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DeviceSessionInitResult {
  sessionId: string;
  userCode: string;
  expiresAt: string;
}

export interface DeviceSessionApproveResult {
  token: string;
}

export interface DeviceTokenMetadata {
  id: string;
  tokenPrefix: string;
  label: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface DeviceSessionStatus {
  status: 'pending' | 'complete' | 'expired';
  expiresAt: string;
  token?: string;
}

export interface ValidatedDeviceToken {
  userId: string;
  tokenId: string;
  authUserId: string;
  email: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapTokenRow(row: DeviceTokenRow): DeviceTokenMetadata {
  return {
    id: row.id,
    tokenPrefix: row.tokenPrefix,
    label: row.label,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Initiates a new device authentication session.
 *
 * The terminal calls this with a device fingerprint. The API generates
 * a session with a user code and expiry. The terminal then displays the
 * login URL and user code to the operator.
 */
export async function initDeviceSession(
  db: DbClient,
  fingerprint: string
): Promise<DeviceSessionInitResult> {
  const fingerprintHash = hashFingerprint(fingerprint);
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const session = await insertDeviceSession(db, {
    deviceFingerprint: fingerprintHash,
    userCode,
    expiresAt,
  });

  return {
    sessionId: session.id,
    userCode: session.userCode,
    expiresAt: session.expiresAt.toISOString(),
  };
}

/**
 * Approves a device session after the user authenticates in the browser.
 *
 * Validates the session is pending and not expired, generates a device token,
 * stores its hash, and marks the session complete. The plaintext token is
 * returned to the browser (shown once) and temporarily stored in the session
 * for the polling terminal to retrieve.
 *
 * @param userId - Internal UUID of the approving user (from request.user)
 * @param label - Optional human-readable label for the token
 */
export async function approveDeviceSession(
  db: DbClient,
  sessionId: string,
  userId: string,
  label?: string
): Promise<DeviceSessionApproveResult> {
  const session = await findDeviceSessionById(db, sessionId);

  if (!session) {
    throw new ApiError(404, 'SESSION_NOT_FOUND', 'Device session not found.');
  }

  if (session.status !== 'pending') {
    throw new ApiError(
      409,
      'SESSION_ALREADY_COMPLETED',
      'Device session has already been completed or expired.'
    );
  }

  if (new Date() > session.expiresAt) {
    await updateDeviceSessionExpired(db, sessionId);
    throw new ApiError(410, 'SESSION_EXPIRED', 'Device session has expired.');
  }

  // Generate the device token
  const { plaintext, hash, prefix } = generateToken();

  // Store the hashed token
  const tokenRow = await insertDeviceToken(db, {
    userId,
    tokenHash: hash,
    tokenPrefix: prefix,
    deviceFingerprint: session.deviceFingerprint,
    label: label ?? null,
  });

  // Atomically mark session as complete — returns false if another request
  // already completed this session (TOCTOU guard)
  const updated = await updateDeviceSessionComplete(
    db, sessionId, userId, tokenRow.id, plaintext
  );

  if (!updated) {
    // Another request already approved this session — revoke the token we just
    // created since it's orphaned
    await repoRevokeDeviceToken(db, tokenRow.id, userId);
    throw new ApiError(
      409,
      'SESSION_ALREADY_COMPLETED',
      'Device session has already been completed or expired.'
    );
  }

  return { token: plaintext };
}

/**
 * Validates a device token from the Authorization header.
 *
 * Looks up the token by its SHA-256 hash, checks it is not revoked or
 * expired, optionally validates the device fingerprint, and updates
 * lastUsedAt (fire and forget).
 *
 * Returns the user info needed to construct synthetic TokenClaims,
 * or null if the token is invalid.
 */
export async function validateDeviceToken(
  db: DbClient,
  plaintextToken: string,
  fingerprint?: string
): Promise<ValidatedDeviceToken | null> {
  const tokenHash = hashToken(plaintextToken);
  const info: DeviceTokenUserInfo | null = await findDeviceTokenByHash(db, tokenHash);

  if (!info) {
    return null;
  }

  // Check if revoked
  if (info.revokedAt) {
    return null;
  }

  // Check if expired
  if (info.expiresAt && new Date() > info.expiresAt) {
    return null;
  }

  // Fingerprint validation: if the token was bound to a device fingerprint,
  // the request MUST provide a matching fingerprint. This prevents stolen
  // tokens from being used on a different machine.
  if (info.deviceFingerprint) {
    if (!fingerprint) {
      return null; // Token requires fingerprint but none provided
    }
    const fingerprintHash = hashFingerprint(fingerprint);
    if (fingerprintHash !== info.deviceFingerprint) {
      return null;
    }
  }

  // Fire and forget: update lastUsedAt without blocking the response
  void updateDeviceTokenLastUsed(db, info.tokenId).catch(() => {
    // Silently ignore — lastUsedAt is non-critical metadata
  });

  return {
    userId: info.userId,
    tokenId: info.tokenId,
    authUserId: info.authUserId,
    email: info.email,
    name: info.name,
  };
}

/**
 * Lists all active (non-revoked) device tokens for a user.
 * Returns metadata only — never exposes token hashes.
 */
export async function listUserTokens(
  db: DbClient,
  userId: string
): Promise<DeviceTokenMetadata[]> {
  const rows = await findDeviceTokensByUser(db, userId);
  return rows.map(mapTokenRow);
}

/**
 * Revokes a device token. Only succeeds if the token belongs to the given user.
 */
export async function revokeToken(
  db: DbClient,
  tokenId: string,
  userId: string
): Promise<boolean> {
  return repoRevokeDeviceToken(db, tokenId, userId);
}

/**
 * Returns the current status of a device session.
 *
 * Computes an effective status by checking expiry for pending sessions.
 * When the session is complete, includes the plaintext token (if still
 * available) and clears it after retrieval so it can only be read once.
 */
export async function getDeviceSession(
  db: DbClient,
  sessionId: string
): Promise<DeviceSessionStatus | null> {
  const session = await findDeviceSessionById(db, sessionId);

  if (!session) {
    return null;
  }

  // Determine effective status
  let effectiveStatus: 'pending' | 'complete' | 'expired' = session.status as
    | 'pending'
    | 'complete'
    | 'expired';

  if (session.status === 'pending' && new Date() > session.expiresAt) {
    effectiveStatus = 'expired';
  }

  const result: DeviceSessionStatus = {
    status: effectiveStatus,
    expiresAt: session.expiresAt.toISOString(),
  };

  // Atomically claim the plaintext token on completed sessions.
  // Uses UPDATE ... SET plaintextToken = NULL ... RETURNING so only the
  // first poll request receives the token — subsequent requests get null.
  if (effectiveStatus === 'complete' && session.plaintextToken) {
    const claimed = await claimDeviceSessionPlaintextToken(db, sessionId);
    if (claimed) {
      result.token = claimed;
    }
  }

  return result;
}
