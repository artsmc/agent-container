import type { DbClient } from '../../db/client';
import type {
  Integration,
  IntegrationPlatform,
} from '@iexcel/shared-types';
import { encrypt, decrypt } from '../../utils/encryption';
import {
  findIntegrationsByUser,
  findIntegrationByUserAndPlatform,
  findAnyConnectedIntegrationByPlatform,
  findIntegrationById,
  insertIntegration,
  updateIntegrationCredentials,
  updateIntegrationStatus,
  updateIntegrationLabel,
  insertSession,
  findSessionById,
  updateSessionStatus,
  type IntegrationRow,
} from '../../repositories/integration-repository';

/** Session TTL: 5 minutes. */
const SESSION_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapIntegrationRow(row: IntegrationRow): Integration {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform as IntegrationPlatform,
    status: row.status as Integration['status'],
    label: row.label,
    webhookUrl: row.webhookUrl,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Returns all integrations for a user (credentials excluded).
 */
export async function listIntegrations(
  db: DbClient,
  userId: string
): Promise<Integration[]> {
  const rows = await findIntegrationsByUser(db, userId);
  return rows.map(mapIntegrationRow);
}

/**
 * Retrieves a single integration by ID.
 */
export async function getIntegration(
  db: DbClient,
  integrationId: string
): Promise<Integration | null> {
  const row = await findIntegrationById(db, integrationId);
  return row ? mapIntegrationRow(row) : null;
}

/**
 * Initiates a credential entry session for the given platform.
 * Returns the session ID to be used in the browser-based credential entry URL.
 */
export async function initSession(
  db: DbClient,
  userId: string,
  platform: IntegrationPlatform
): Promise<{ sessionId: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await insertSession(db, { userId, platform, expiresAt });
  return {
    sessionId: session.id,
    expiresAt: session.expiresAt.toISOString(),
  };
}

/**
 * Completes a credential entry session.
 *
 * Validates the session is still pending and not expired,
 * encrypts credentials, and stores (or updates) the integration.
 *
 * @param encryptionKey - 64-char hex key from INTEGRATION_ENCRYPTION_KEY.
 * @param credentials - JSON-serializable credential data.
 * @param webhookUrl - Optional webhook URL for the platform.
 * @returns The created or updated Integration.
 */
export async function completeSession(
  db: DbClient,
  sessionId: string,
  encryptionKey: string,
  credentials: Record<string, unknown>,
  options?: { label?: string; webhookUrl?: string }
): Promise<Integration> {
  const session = await findSessionById(db, sessionId);

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'pending') {
    throw new Error('Session is no longer pending');
  }

  if (new Date() > session.expiresAt) {
    await updateSessionStatus(db, sessionId, 'expired');
    throw new Error('Session has expired');
  }

  // Encrypt credentials
  const credentialsJson = JSON.stringify(credentials);
  const { encrypted, iv } = encrypt(credentialsJson, encryptionKey);

  // Check for existing integration
  const existing = await findIntegrationByUserAndPlatform(
    db,
    session.userId,
    session.platform as IntegrationPlatform
  );

  let row: IntegrationRow;

  if (existing) {
    // Update existing integration with new credentials
    row = await updateIntegrationCredentials(db, existing.id, {
      credentialsEncrypted: encrypted,
      credentialsIv: iv,
      status: 'connected',
    });
    if (options?.label) {
      row = await updateIntegrationLabel(db, existing.id, options.label);
    }
  } else {
    // Create new integration
    row = await insertIntegration(db, {
      userId: session.userId,
      platform: session.platform as IntegrationPlatform,
      label: options?.label ?? null,
      credentialsEncrypted: encrypted,
      credentialsIv: iv,
      webhookUrl: options?.webhookUrl ?? null,
      webhookId: null,
    });
  }

  // Mark session as complete
  await updateSessionStatus(db, sessionId, 'complete');

  return mapIntegrationRow(row);
}

/**
 * Connects an integration directly (non-session flow).
 * Used when the API receives credentials directly (e.g., API key).
 */
export async function connectIntegration(
  db: DbClient,
  userId: string,
  platform: IntegrationPlatform,
  encryptionKey: string,
  credentials: Record<string, unknown>,
  options?: { label?: string; webhookUrl?: string }
): Promise<Integration> {
  // Check for existing integration
  const existing = await findIntegrationByUserAndPlatform(db, userId, platform);

  const credentialsJson = JSON.stringify(credentials);
  const { encrypted, iv } = encrypt(credentialsJson, encryptionKey);

  let row: IntegrationRow;

  if (existing) {
    row = await updateIntegrationCredentials(db, existing.id, {
      credentialsEncrypted: encrypted,
      credentialsIv: iv,
      status: 'connected',
    });
    if (options?.label) {
      row = await updateIntegrationLabel(db, existing.id, options.label);
    }
  } else {
    row = await insertIntegration(db, {
      userId,
      platform,
      label: options?.label ?? null,
      credentialsEncrypted: encrypted,
      credentialsIv: iv,
      webhookUrl: options?.webhookUrl ?? null,
      webhookId: null,
    });
  }

  return mapIntegrationRow(row);
}

/**
 * Decrypts and returns credentials for a user's integration.
 * Returns null if no integration exists or if disconnected.
 *
 * When `role` is 'admin' and the user has no integration of their own,
 * falls back to any connected integration for that platform. This allows
 * service accounts (e.g. Mastra agent) to use team integrations.
 */
export async function getCredentials(
  db: DbClient,
  userId: string,
  platform: IntegrationPlatform,
  encryptionKey: string,
  role?: string
): Promise<Record<string, unknown> | null> {
  let row = await findIntegrationByUserAndPlatform(db, userId, platform);

  // Admin fallback: use any connected integration for this platform
  if ((!row || row.status === 'disconnected') && role === 'admin') {
    row = await findAnyConnectedIntegrationByPlatform(db, platform);
  }

  if (!row || row.status === 'disconnected') {
    return null;
  }

  const json = decrypt(row.credentialsEncrypted, row.credentialsIv, encryptionKey);
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Disconnects an integration by marking it as disconnected.
 */
export async function disconnectIntegration(
  db: DbClient,
  userId: string,
  platform: IntegrationPlatform
): Promise<boolean> {
  const row = await findIntegrationByUserAndPlatform(db, userId, platform);
  if (!row) return false;

  await updateIntegrationStatus(db, row.id, 'disconnected');
  return true;
}

/**
 * Returns the webhook URL for a user's platform integration.
 */
export async function getWebhookUrl(
  db: DbClient,
  userId: string,
  platform: IntegrationPlatform
): Promise<string | null> {
  const row = await findIntegrationByUserAndPlatform(db, userId, platform);
  return row?.webhookUrl ?? null;
}
