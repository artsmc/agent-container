import { eq, and } from 'drizzle-orm';
import { integrations, integrationSessions } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import type { IntegrationPlatform, IntegrationStatus } from '@iexcel/shared-types';

// ---------------------------------------------------------------------------
// Integration row types
// ---------------------------------------------------------------------------

export interface IntegrationRow {
  id: string;
  userId: string;
  platform: string;
  label: string | null;
  credentialsEncrypted: Buffer;
  credentialsIv: Buffer;
  status: string;
  webhookId: string | null;
  webhookUrl: string | null;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationSessionRow {
  id: string;
  userId: string;
  platform: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Integration CRUD
// ---------------------------------------------------------------------------

export async function findIntegrationsByUser(
  db: DbClient,
  userId: string
): Promise<IntegrationRow[]> {
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.userId, userId));
  return rows as IntegrationRow[];
}

export async function findIntegrationByUserAndPlatform(
  db: DbClient,
  userId: string,
  platform: IntegrationPlatform
): Promise<IntegrationRow | null> {
  const rows = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.platform, platform)
      )
    )
    .limit(1);
  return (rows[0] as IntegrationRow) ?? null;
}

export async function findAnyConnectedIntegrationByPlatform(
  db: DbClient,
  platform: IntegrationPlatform
): Promise<IntegrationRow | null> {
  const rows = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.platform, platform),
        eq(integrations.status, 'connected')
      )
    )
    .limit(1);
  return (rows[0] as IntegrationRow) ?? null;
}

export async function findIntegrationById(
  db: DbClient,
  id: string
): Promise<IntegrationRow | null> {
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.id, id))
    .limit(1);
  return (rows[0] as IntegrationRow) ?? null;
}

export async function findIntegrationByWebhookId(
  db: DbClient,
  webhookId: string
): Promise<IntegrationRow | null> {
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.webhookId, webhookId))
    .limit(1);
  return (rows[0] as IntegrationRow) ?? null;
}

export async function insertIntegration(
  db: DbClient,
  params: {
    userId: string;
    platform: IntegrationPlatform;
    label: string | null;
    credentialsEncrypted: Buffer;
    credentialsIv: Buffer;
    webhookUrl: string | null;
    webhookId: string | null;
  }
): Promise<IntegrationRow> {
  const [row] = await db
    .insert(integrations)
    .values({
      userId: params.userId,
      platform: params.platform,
      label: params.label,
      credentialsEncrypted: params.credentialsEncrypted,
      credentialsIv: params.credentialsIv,
      webhookUrl: params.webhookUrl,
      webhookId: params.webhookId,
    })
    .returning();
  return row as IntegrationRow;
}

export async function updateIntegrationCredentials(
  db: DbClient,
  id: string,
  params: {
    credentialsEncrypted: Buffer;
    credentialsIv: Buffer;
    status: IntegrationStatus;
  }
): Promise<IntegrationRow> {
  const [row] = await db
    .update(integrations)
    .set({
      credentialsEncrypted: params.credentialsEncrypted,
      credentialsIv: params.credentialsIv,
      status: params.status,
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, id))
    .returning();
  return row as IntegrationRow;
}

export async function updateIntegrationStatus(
  db: DbClient,
  id: string,
  status: IntegrationStatus
): Promise<void> {
  await db
    .update(integrations)
    .set({ status, updatedAt: new Date() })
    .where(eq(integrations.id, id));
}

export async function updateIntegrationLabel(
  db: DbClient,
  id: string,
  label: string
): Promise<IntegrationRow> {
  const [row] = await db
    .update(integrations)
    .set({ label, updatedAt: new Date() })
    .where(eq(integrations.id, id))
    .returning();
  return row as IntegrationRow;
}

export async function updateIntegrationLastSync(
  db: DbClient,
  id: string
): Promise<void> {
  await db
    .update(integrations)
    .set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(integrations.id, id));
}

// ---------------------------------------------------------------------------
// Integration Session CRUD
// ---------------------------------------------------------------------------

export async function insertSession(
  db: DbClient,
  params: {
    userId: string;
    platform: IntegrationPlatform;
    expiresAt: Date;
  }
): Promise<IntegrationSessionRow> {
  const [row] = await db
    .insert(integrationSessions)
    .values({
      userId: params.userId,
      platform: params.platform,
      expiresAt: params.expiresAt,
    })
    .returning();
  return row as IntegrationSessionRow;
}

export async function findSessionById(
  db: DbClient,
  sessionId: string
): Promise<IntegrationSessionRow | null> {
  const rows = await db
    .select()
    .from(integrationSessions)
    .where(eq(integrationSessions.id, sessionId))
    .limit(1);
  return (rows[0] as IntegrationSessionRow) ?? null;
}

export async function updateSessionStatus(
  db: DbClient,
  sessionId: string,
  status: 'complete' | 'expired'
): Promise<void> {
  await db
    .update(integrationSessions)
    .set({ status })
    .where(eq(integrationSessions.id, sessionId));
}
