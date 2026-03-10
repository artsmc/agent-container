import { eq, sql, and, count } from 'drizzle-orm';
import {
  clients,
  clientUsers,
  tasks,
  agendas,
  auditLog,
} from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import type { PatchClientBody, CreateClientBody } from '../validators/client-validators';
import type {
  ClientRecord,
  EmailRecipientRecord,
  ListClientsResult,
  TaskCounts,
  AgendaSummary,
  AuditLogEntry,
} from './client-types';

// Re-export all types so consumers can import from a single module
export type {
  ClientRecord,
  EmailRecipientRecord,
  ListClientsResult,
  TaskCounts,
  AgendaSummary,
  ClientStatusResult,
  AuditLogEntry,
} from './client-types';

/** Shape expected by the row mapper (common to full select and join select). */
interface ClientRowLike {
  id: string;
  name: string;
  grainPlaylistId: string | null;
  defaultAsanaWorkspaceId: string | null;
  defaultAsanaProjectId: string | null;
  emailRecipients: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a Drizzle client row to the API response shape. */
function mapClientRow(row: ClientRowLike): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    grain_playlist_id: row.grainPlaylistId ?? null,
    default_asana_workspace_id: row.defaultAsanaWorkspaceId ?? null,
    default_asana_project_id: row.defaultAsanaProjectId ?? null,
    email_recipients: (row.emailRecipients ?? []) as EmailRecipientRecord[],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/**
 * Returns a paginated list of clients accessible to the user.
 * Admins see all clients. Other roles see only assigned clients.
 */
export async function listClients(
  db: DbClient,
  userId: string,
  role: string,
  page: number,
  perPage: number
): Promise<ListClientsResult> {
  const offset = (page - 1) * perPage;

  if (role === 'admin') {
    const [rows, totalResult] = await Promise.all([
      db
        .select()
        .from(clients)
        .orderBy(clients.name)
        .limit(perPage)
        .offset(offset),
      db.select({ count: count() }).from(clients),
    ]);

    return {
      rows: rows.map(mapClientRow),
      total: totalResult[0]?.count ?? 0,
    };
  }

  // Non-admin: join through client_users
  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        grainPlaylistId: clients.grainPlaylistId,
        defaultAsanaWorkspaceId: clients.defaultAsanaWorkspaceId,
        defaultAsanaProjectId: clients.defaultAsanaProjectId,
        emailRecipients: clients.emailRecipients,
        createdAt: clients.createdAt,
        updatedAt: clients.updatedAt,
      })
      .from(clients)
      .innerJoin(clientUsers, eq(clients.id, clientUsers.clientId))
      .where(eq(clientUsers.userId, userId))
      .orderBy(clients.name)
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: count() })
      .from(clients)
      .innerJoin(clientUsers, eq(clients.id, clientUsers.clientId))
      .where(eq(clientUsers.userId, userId)),
  ]);

  return {
    rows: rows.map(mapClientRow),
    total: totalResult[0]?.count ?? 0,
  };
}

/**
 * Returns a single client record, respecting role-based access.
 * Returns null if the client does not exist or the user cannot access it.
 */
export async function getClientById(
  db: DbClient,
  clientId: string,
  userId: string,
  role: string
): Promise<ClientRecord | null> {
  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Admin bypasses assignment check
  if (role !== 'admin') {
    const assignment = await db
      .select({ clientId: clientUsers.clientId })
      .from(clientUsers)
      .where(
        and(
          eq(clientUsers.clientId, clientId),
          eq(clientUsers.userId, userId)
        )
      )
      .limit(1);

    if (assignment.length === 0) return null;
  }

  return mapClientRow(row);
}

/**
 * Creates a new client record and returns the mapped result.
 */
export async function createClient(
  db: DbClient,
  body: CreateClientBody
): Promise<ClientRecord> {
  const inserted = await db
    .insert(clients)
    .values({
      name: body.name,
      grainPlaylistId: body.grain_playlist_id ?? null,
      defaultAsanaWorkspaceId: body.default_asana_workspace_id ?? null,
      defaultAsanaProjectId: body.default_asana_project_id ?? null,
      emailRecipients: body.email_recipients ?? [],
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new Error('Failed to insert client');
  }

  return mapClientRow(row);
}

/**
 * Partially updates a client record. Only fields present in the patch body
 * are updated. Always sets updated_at to the current timestamp.
 *
 * Returns the full updated record.
 */
export async function updateClient(
  db: DbClient,
  clientId: string,
  patchBody: PatchClientBody
): Promise<ClientRecord> {
  const updateSet: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (patchBody.name !== undefined) {
    updateSet['name'] = patchBody.name;
  }
  if (patchBody.grain_playlist_id !== undefined) {
    updateSet['grainPlaylistId'] = patchBody.grain_playlist_id;
  }
  if (patchBody.default_asana_workspace_id !== undefined) {
    updateSet['defaultAsanaWorkspaceId'] = patchBody.default_asana_workspace_id;
  }
  if (patchBody.default_asana_project_id !== undefined) {
    updateSet['defaultAsanaProjectId'] = patchBody.default_asana_project_id;
  }
  if (patchBody.email_recipients !== undefined) {
    updateSet['emailRecipients'] = patchBody.email_recipients;
  }

  const updated = await db
    .update(clients)
    .set(updateSet)
    .where(eq(clients.id, clientId))
    .returning();

  const row = updated[0];
  if (!row) {
    throw new Error(`Failed to update client ${clientId}`);
  }

  return mapClientRow(row);
}

/**
 * Returns task counts grouped by status for a given client.
 * Statuses with zero tasks are included with count 0.
 */
export async function getClientTaskCounts(
  db: DbClient,
  clientId: string
): Promise<TaskCounts> {
  const rows = await db
    .select({
      status: tasks.status,
      count: count(),
    })
    .from(tasks)
    .where(eq(tasks.clientId, clientId))
    .groupBy(tasks.status);

  const counts: TaskCounts = {
    total: 0,
    draft: 0,
    pending_approval: 0,
    approved: 0,
    pushed: 0,
    rejected: 0,
  };

  for (const row of rows) {
    const c = row.count;
    switch (row.status) {
      case 'draft':
        counts.draft = c;
        counts.pending_approval = c; // Alias in V1
        break;
      case 'approved':
        counts.approved = c;
        break;
      case 'pushed':
        counts.pushed = c;
        break;
      case 'rejected':
        counts.rejected = c;
        break;
      case 'completed':
        // completed tasks still count towards total
        break;
    }
    counts.total += c;
  }

  return counts;
}

/**
 * Returns the most recent agenda for a client, or null if none exist.
 */
export async function getMostRecentAgenda(
  db: DbClient,
  clientId: string
): Promise<AgendaSummary | null> {
  const rows = await db
    .select({
      id: agendas.id,
      shortId: agendas.shortId,
      status: agendas.status,
      cycleStart: agendas.cycleStart,
      cycleEnd: agendas.cycleEnd,
      updatedAt: agendas.updatedAt,
    })
    .from(agendas)
    .where(eq(agendas.clientId, clientId))
    .orderBy(sql`${agendas.updatedAt} DESC`)
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    short_id: row.shortId,
    status: row.status,
    cycle_start: row.cycleStart,
    cycle_end: row.cycleEnd,
    updated_at: row.updatedAt.toISOString(),
  };
}

/**
 * Writes an entry to the audit_log table.
 */
export async function writeAuditLog(
  db: DbClient,
  entry: AuditLogEntry
): Promise<void> {
  await db.insert(auditLog).values({
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata,
    source: entry.source,
  });
}

/**
 * Computes the list of field names whose values actually changed
 * between the current record and the patch body.
 *
 * Only considers fields present in the patch body. Deep equality
 * is used for the email_recipients array.
 */
export function computeChangedFields(
  current: ClientRecord,
  patch: PatchClientBody
): string[] {
  const changed: string[] = [];

  if (patch.name !== undefined && patch.name !== current.name) {
    changed.push('name');
  }
  if (
    patch.grain_playlist_id !== undefined &&
    patch.grain_playlist_id !== current.grain_playlist_id
  ) {
    changed.push('grain_playlist_id');
  }
  if (
    patch.default_asana_workspace_id !== undefined &&
    patch.default_asana_workspace_id !== current.default_asana_workspace_id
  ) {
    changed.push('default_asana_workspace_id');
  }
  if (
    patch.default_asana_project_id !== undefined &&
    patch.default_asana_project_id !== current.default_asana_project_id
  ) {
    changed.push('default_asana_project_id');
  }
  if (patch.email_recipients !== undefined) {
    const currentJson = JSON.stringify(current.email_recipients);
    const patchJson = JSON.stringify(patch.email_recipients);
    if (currentJson !== patchJson) {
      changed.push('email_recipients');
    }
  }

  return changed;
}
