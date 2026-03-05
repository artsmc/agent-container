import { eq, sql, and, count, desc, asc } from 'drizzle-orm';
import {
  agendas,
  agendaVersions,
  clients,
} from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import { ApiError, ForbiddenError, BusinessError } from '../errors/api-errors';
import { resolveAgendaId } from '../utils/agenda-short-id';
import { generateShareTokens, buildShareUrls } from '../utils/share-token';
import { verifyClientAccess, writeAudit } from './task-helpers';
import { getEmailAdapter } from '../adapters/email-adapter';
import { getGoogleDocsAdapter } from '../adapters/google-docs-adapter';
import type {
  AgendaSummaryResponse,
  AgendaDetailResponse,
  AgendaVersionResponse,
  PublicAgendaResponse,
} from './agenda-types';
import type { CreateAgendaBody, EditAgendaBody, EmailAgendaBody } from '../validators/agenda-validators';

// Re-export types for route handlers
export type {
  AgendaSummaryResponse,
  AgendaDetailResponse,
  PublicAgendaResponse,
} from './agenda-types';

// ---------------------------------------------------------------------------
// Row type interfaces
// ---------------------------------------------------------------------------

interface AgendaRow {
  id: string;
  shortId: string;
  clientId: string;
  status: string;
  content: unknown;
  cycleStart: string | null;
  cycleEnd: string | null;
  sharedUrlToken: string | null;
  internalUrlToken: string | null;
  googleDocId: string | null;
  finalizedBy: string | null;
  finalizedAt: Date | null;
  sharedAt: Date | null;
  isImported: boolean;
  importedAt: Date | null;
  importSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AgendaVersionRow {
  id: string;
  version: number;
  content: unknown;
  editedBy: string | null;
  source: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapAgendaSummary(row: AgendaRow): AgendaSummaryResponse {
  return {
    id: row.id,
    short_id: row.shortId,
    client_id: row.clientId,
    status: row.status,
    cycle_start: row.cycleStart,
    cycle_end: row.cycleEnd,
    finalized_at: row.finalizedAt?.toISOString() ?? null,
    shared_at: row.sharedAt?.toISOString() ?? null,
    google_doc_id: row.googleDocId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function mapAgendaVersion(row: AgendaVersionRow): AgendaVersionResponse {
  return {
    id: row.id,
    version: row.version,
    content: row.content,
    edited_by: row.editedBy,
    source: row.source,
    created_at: row.createdAt.toISOString(),
  };
}

function mapAgendaDetail(
  row: AgendaRow,
  versions: AgendaVersionRow[]
): AgendaDetailResponse {
  return {
    ...mapAgendaSummary(row),
    content: row.content,
    shared_url_token: row.sharedUrlToken,
    internal_url_token: row.internalUrlToken,
    finalized_by: row.finalizedBy,
    versions: versions.map(mapAgendaVersion),
  };
}

// ---------------------------------------------------------------------------
// Create draft agenda
// ---------------------------------------------------------------------------

export async function createAgenda(
  db: DbClient,
  clientId: string,
  userId: string,
  body: CreateAgendaBody,
  source: 'agent' | 'ui' | 'terminal'
): Promise<AgendaDetailResponse> {
  const effectiveSource = body.source ?? source;

  // Get next short ID using the database function
  const shortIdResult = await db.execute(
    sql`SELECT next_agenda_short_id() AS short_id`
  );
  const shortId = (shortIdResult[0] as Record<string, string>)['short_id'];

  // Insert agenda row
  const insertedRows = await db
    .insert(agendas)
    .values({
      shortId: shortId,
      clientId: clientId,
      status: 'draft',
      content: body.content,
      cycleStart: body.cycle_start,
      cycleEnd: body.cycle_end,
    })
    .returning();

  const inserted = insertedRows[0];
  if (!inserted) {
    throw new Error('Failed to insert agenda');
  }

  // Insert initial version (version 1)
  const versionRows = await db
    .insert(agendaVersions)
    .values({
      agendaId: inserted.id,
      version: 1,
      content: body.content,
      editedBy: userId,
      source: effectiveSource,
    })
    .returning();

  // Write audit log
  await writeAudit(db, {
    userId,
    action: 'agenda.created',
    entityType: 'agenda',
    entityId: inserted.id,
    metadata: {
      short_id: shortId,
      client_id: clientId,
      cycle_start: body.cycle_start,
      cycle_end: body.cycle_end,
      source: effectiveSource,
    },
    source: effectiveSource,
  });

  return mapAgendaDetail(inserted as AgendaRow, (versionRows as AgendaVersionRow[]) ?? []);
}

// ---------------------------------------------------------------------------
// List agendas
// ---------------------------------------------------------------------------

export async function listAgendas(
  db: DbClient,
  clientId: string,
  filters: { status?: string },
  page: number,
  perPage: number
): Promise<{ data: AgendaSummaryResponse[]; total: number }> {
  const offset = (page - 1) * perPage;

  const conditions = [eq(agendas.clientId, clientId)];
  if (filters.status) {
    conditions.push(
      sql`${agendas.status} = ${filters.status}` as ReturnType<typeof eq>
    );
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(agendas)
      .where(whereClause)
      .orderBy(desc(agendas.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ count: count() }).from(agendas).where(whereClause),
  ]);

  return {
    data: rows.map((r) => mapAgendaSummary(r as AgendaRow)),
    total: totalResult[0]?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Get agenda detail
// ---------------------------------------------------------------------------

export async function getAgendaDetail(
  db: DbClient,
  agendaId: string
): Promise<AgendaDetailResponse | null> {
  const agendaRows = await db
    .select()
    .from(agendas)
    .where(eq(agendas.id, agendaId))
    .limit(1);

  const agenda = agendaRows[0];
  if (!agenda) return null;

  const versions = await db
    .select()
    .from(agendaVersions)
    .where(eq(agendaVersions.agendaId, agendaId))
    .orderBy(asc(agendaVersions.version));

  return mapAgendaDetail(agenda as AgendaRow, versions as AgendaVersionRow[]);
}

// ---------------------------------------------------------------------------
// Edit agenda
// ---------------------------------------------------------------------------

export async function editAgenda(
  db: DbClient,
  agendaIdParam: string,
  userId: string,
  userRole: string,
  body: EditAgendaBody,
  source: 'agent' | 'ui' | 'terminal'
): Promise<AgendaDetailResponse> {
  const agendaId = await resolveAgendaId(agendaIdParam, db);

  const agendaRows = await db
    .select()
    .from(agendas)
    .where(eq(agendas.id, agendaId))
    .limit(1);

  const agenda = agendaRows[0];
  if (!agenda) {
    throw new ApiError(404, 'AGENDA_NOT_FOUND', 'Agenda not found');
  }

  const hasAccess = await verifyClientAccess(db, agenda.clientId, userId, userRole);
  if (!hasAccess) {
    throw new ForbiddenError('You do not have access to this agenda');
  }

  if (agenda.status !== 'draft' && agenda.status !== 'in_review') {
    throw new BusinessError(422, 'AGENDA_NOT_EDITABLE', 'Agenda cannot be edited in its current status', {
      current_status: agenda.status,
    });
  }

  // Build update set
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  const previousStatus = agenda.status;

  if (body.content !== undefined) {
    updateSet['content'] = body.content;
  }
  if (body.cycle_start !== undefined) {
    updateSet['cycleStart'] = body.cycle_start;
  }
  if (body.cycle_end !== undefined) {
    updateSet['cycleEnd'] = body.cycle_end;
  }

  // Validate cycle dates after applying edits
  const effectiveCycleStart = (body.cycle_start ?? agenda.cycleStart) as string | null;
  const effectiveCycleEnd = (body.cycle_end ?? agenda.cycleEnd) as string | null;
  if (effectiveCycleStart && effectiveCycleEnd && effectiveCycleEnd < effectiveCycleStart) {
    throw new BusinessError(422, 'VALIDATION_ERROR', 'cycle_end must be on or after cycle_start', {
      field: 'cycle_end',
    });
  }

  // If status is draft, promote to in_review
  if (agenda.status === 'draft') {
    updateSet['status'] = 'in_review';
  }

  await db.update(agendas).set(updateSet).where(eq(agendas.id, agendaId));

  // Get next version number
  const maxVersionResult = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(${agendaVersions.version}), 0)` })
    .from(agendaVersions)
    .where(eq(agendaVersions.agendaId, agendaId));
  const nextVersion = (maxVersionResult[0]?.maxVersion ?? 0) + 1;

  // Fetch updated agenda for version content
  const updatedAgendaRows = await db
    .select()
    .from(agendas)
    .where(eq(agendas.id, agendaId))
    .limit(1);
  const updatedAgenda = updatedAgendaRows[0];
  if (!updatedAgenda) throw new Error('Agenda disappeared after update');

  // Insert version record
  await db.insert(agendaVersions).values({
    agendaId: agendaId,
    version: nextVersion,
    content: updatedAgenda.content,
    editedBy: userId,
    source: source,
  });

  // Write audit entry
  const auditMetadata: Record<string, unknown> = {
    version: nextVersion,
    source,
  };
  if (previousStatus === 'draft') {
    auditMetadata['previous_status'] = previousStatus;
  }

  await writeAudit(db, {
    userId,
    action: 'agenda.edited',
    entityType: 'agenda',
    entityId: agendaId,
    metadata: auditMetadata,
    source,
  });

  const detail = await getAgendaDetail(db, agendaId);
  if (!detail) throw new Error('Agenda not found after edit');
  return detail;
}

// ---------------------------------------------------------------------------
// Finalize agenda
// ---------------------------------------------------------------------------

export async function finalizeAgenda(
  db: DbClient,
  agendaIdParam: string,
  userId: string,
  userRole: string,
  force: boolean,
  source: 'agent' | 'ui' | 'terminal'
): Promise<AgendaDetailResponse> {
  const agendaId = await resolveAgendaId(agendaIdParam, db);

  const agendaRows = await db
    .select()
    .from(agendas)
    .where(eq(agendas.id, agendaId))
    .limit(1);

  const agenda = agendaRows[0];
  if (!agenda) {
    throw new ApiError(404, 'AGENDA_NOT_FOUND', 'Agenda not found');
  }

  const hasAccess = await verifyClientAccess(db, agenda.clientId, userId, userRole);
  if (!hasAccess) {
    throw new ForbiddenError('You do not have access to this agenda');
  }

  // Role check: account_manager or admin only
  if (userRole !== 'account_manager' && userRole !== 'admin') {
    throw new ForbiddenError('Only account managers and admins can finalize agendas');
  }

  // Precondition: not already finalized/shared
  if (agenda.status === 'finalized' || agenda.status === 'shared') {
    throw new BusinessError(422, 'AGENDA_ALREADY_FINALIZED', 'Agenda is already finalized or shared', {
      current_status: agenda.status,
    });
  }

  // Check for human edits
  const versions = await db
    .select()
    .from(agendaVersions)
    .where(eq(agendaVersions.agendaId, agendaId));

  const hasHumanEdit = versions.some((v) => v.source !== 'agent');
  if (!hasHumanEdit && !force) {
    throw new BusinessError(422, 'AGENDA_NOT_FINALIZABLE', 'Agenda has not been edited by a human. Pass force: true to confirm.', {
      requires_force: true,
    });
  }

  // Execute transition
  const now = new Date();
  await db
    .update(agendas)
    .set({
      status: 'finalized',
      finalizedBy: userId,
      finalizedAt: now,
      updatedAt: now,
    })
    .where(eq(agendas.id, agendaId));

  // Write audit entry
  await writeAudit(db, {
    userId,
    action: 'agenda.finalized',
    entityType: 'agenda',
    entityId: agendaId,
    metadata: {
      finalized_by: userId,
      finalized_at: now.toISOString(),
      forced: force,
    },
    source,
  });

  const detail = await getAgendaDetail(db, agendaId);
  if (!detail) throw new Error('Agenda not found after finalization');
  return detail;
}

// ---------------------------------------------------------------------------
// Share agenda
// ---------------------------------------------------------------------------

export async function shareAgenda(
  db: DbClient,
  agendaIdParam: string,
  userId: string,
  userRole: string,
  source: 'agent' | 'ui' | 'terminal'
): Promise<{ agenda: AgendaDetailResponse; share_urls: { client_url: string; internal_url: string } }> {
  const agendaId = await resolveAgendaId(agendaIdParam, db);

  const agendaRows = await db
    .select()
    .from(agendas)
    .where(eq(agendas.id, agendaId))
    .limit(1);

  const agenda = agendaRows[0];
  if (!agenda) {
    throw new ApiError(404, 'AGENDA_NOT_FOUND', 'Agenda not found');
  }

  const hasAccess = await verifyClientAccess(db, agenda.clientId, userId, userRole);
  if (!hasAccess) {
    throw new ForbiddenError('You do not have access to this agenda');
  }

  // Role check: account_manager or admin only
  if (userRole !== 'account_manager' && userRole !== 'admin') {
    throw new ForbiddenError('Only account managers and admins can share agendas');
  }

  // Precondition: must be finalized or already shared
  if (agenda.status !== 'finalized' && agenda.status !== 'shared') {
    throw new BusinessError(422, 'AGENDA_NOT_SHAREABLE', 'Agenda must be finalized before sharing', {
      current_status: agenda.status,
    });
  }

  // Generate or reuse tokens (idempotent)
  const tokens = await generateShareTokens(agendaId, db);

  // If first share (status was finalized), transition to shared
  if (agenda.status === 'finalized') {
    const now = new Date();
    await db
      .update(agendas)
      .set({
        status: 'shared',
        sharedAt: now,
        updatedAt: now,
      })
      .where(eq(agendas.id, agendaId));

    await writeAudit(db, {
      userId,
      action: 'agenda.shared',
      entityType: 'agenda',
      entityId: agendaId,
      metadata: {
        shared_at: now.toISOString(),
      },
      source,
    });
  }
  // If already shared, skip status update and audit write

  const detail = await getAgendaDetail(db, agendaId);
  if (!detail) throw new Error('Agenda not found after share');

  const shareUrls = buildShareUrls(tokens);

  return { agenda: detail, share_urls: shareUrls };
}

// ---------------------------------------------------------------------------
// Email agenda
// ---------------------------------------------------------------------------

export async function emailAgenda(
  db: DbClient,
  agendaIdParam: string,
  userId: string,
  userRole: string,
  body: EmailAgendaBody,
  source: 'agent' | 'ui' | 'terminal'
): Promise<{ agenda: AgendaDetailResponse; email: { sent_to: string[]; sent_at: string } }> {
  const agendaId = await resolveAgendaId(agendaIdParam, db);

  const agendaRows = await db
    .select()
    .from(agendas)
    .where(eq(agendas.id, agendaId))
    .limit(1);

  const agenda = agendaRows[0];
  if (!agenda) {
    throw new ApiError(404, 'AGENDA_NOT_FOUND', 'Agenda not found');
  }

  const hasAccess = await verifyClientAccess(db, agenda.clientId, userId, userRole);
  if (!hasAccess) {
    throw new ForbiddenError('You do not have access to this agenda');
  }

  // Role check
  if (userRole !== 'account_manager' && userRole !== 'admin') {
    throw new ForbiddenError('Only account managers and admins can email agendas');
  }

  // Status check
  if (agenda.status !== 'finalized' && agenda.status !== 'shared') {
    throw new BusinessError(422, 'AGENDA_NOT_EMAILABLE', 'Agenda must be finalized or shared before emailing', {
      current_status: agenda.status,
    });
  }

  // Resolve recipients
  const recipients = await resolveEmailRecipients(body.recipients, agenda.clientId, db);

  // Get client name for the email
  const clientRows = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, agenda.clientId))
    .limit(1);
  const clientName = clientRows[0]?.name ?? 'Unknown Client';

  // Call email adapter
  try {
    const result = await getEmailAdapter().sendAgenda({
      agenda: {
        short_id: agenda.shortId,
        content: agenda.content,
        cycle_start: agenda.cycleStart,
        cycle_end: agenda.cycleEnd,
      },
      client_name: clientName,
      recipients,
    });

    // Write audit entry
    await writeAudit(db, {
      userId,
      action: 'agenda.emailed',
      entityType: 'agenda',
      entityId: agendaId,
      metadata: {
        recipients,
        sent_at: result.sent_at,
        source,
      },
      source,
    });

    const detail = await getAgendaDetail(db, agendaId);
    if (!detail) throw new Error('Agenda not found after email');

    return {
      agenda: detail,
      email: { sent_to: recipients, sent_at: result.sent_at },
    };
  } catch (err) {
    // If it's already an ApiError/BusinessError, rethrow
    if (err instanceof ApiError) throw err;

    // Wrap adapter errors as EMAIL_FAILED (502)
    throw new BusinessError(502, 'EMAIL_FAILED', 'Failed to send agenda email', {
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ---------------------------------------------------------------------------
// Export agenda
// ---------------------------------------------------------------------------

export async function exportAgenda(
  db: DbClient,
  agendaIdParam: string,
  userId: string,
  userRole: string,
  source: 'agent' | 'ui' | 'terminal'
): Promise<{ agenda: AgendaDetailResponse; export: { google_doc_id: string; exported_at: string } }> {
  const agendaId = await resolveAgendaId(agendaIdParam, db);

  const agendaRows = await db
    .select()
    .from(agendas)
    .where(eq(agendas.id, agendaId))
    .limit(1);

  const agenda = agendaRows[0];
  if (!agenda) {
    throw new ApiError(404, 'AGENDA_NOT_FOUND', 'Agenda not found');
  }

  const hasAccess = await verifyClientAccess(db, agenda.clientId, userId, userRole);
  if (!hasAccess) {
    throw new ForbiddenError('You do not have access to this agenda');
  }

  // Role check
  if (userRole !== 'account_manager' && userRole !== 'admin') {
    throw new ForbiddenError('Only account managers and admins can export agendas');
  }

  // Status check
  if (agenda.status !== 'finalized' && agenda.status !== 'shared') {
    throw new BusinessError(422, 'AGENDA_NOT_EXPORTABLE', 'Agenda must be finalized or shared before exporting', {
      current_status: agenda.status,
    });
  }

  // Get client name
  const clientRows = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, agenda.clientId))
    .limit(1);
  const clientName = clientRows[0]?.name ?? 'Unknown Client';

  // Call Google Docs adapter
  try {
    const result = await getGoogleDocsAdapter().exportAgenda({
      agenda: {
        short_id: agenda.shortId,
        content: agenda.content,
        cycle_start: agenda.cycleStart,
        cycle_end: agenda.cycleEnd,
      },
      client_name: clientName,
      existing_doc_id: agenda.googleDocId,
    });

    const now = new Date();
    const exportedAt = now.toISOString();

    // Update agenda with google_doc_id
    await db
      .update(agendas)
      .set({
        googleDocId: result.google_doc_id,
        updatedAt: now,
      })
      .where(eq(agendas.id, agendaId));

    // Write audit entry
    await writeAudit(db, {
      userId,
      action: 'agenda.exported',
      entityType: 'agenda',
      entityId: agendaId,
      metadata: {
        google_doc_id: result.google_doc_id,
        exported_at: exportedAt,
      },
      source,
    });

    const detail = await getAgendaDetail(db, agendaId);
    if (!detail) throw new Error('Agenda not found after export');

    return {
      agenda: detail,
      export: { google_doc_id: result.google_doc_id, exported_at: exportedAt },
    };
  } catch (err) {
    // If it's already an ApiError/BusinessError, rethrow
    if (err instanceof ApiError) throw err;

    // Wrap adapter errors as EXPORT_FAILED (502)
    throw new BusinessError(502, 'EXPORT_FAILED', 'Failed to export agenda to Google Docs', {
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ---------------------------------------------------------------------------
// Public shared agenda
// ---------------------------------------------------------------------------

export async function getPublicAgenda(
  db: DbClient,
  token: string
): Promise<PublicAgendaResponse | null> {
  const agendaRows = await db
    .select()
    .from(agendas)
    .where(eq(agendas.sharedUrlToken, token))
    .limit(1);

  const agenda = agendaRows[0];
  if (!agenda) return null;

  // Fetch client name
  const clientRows = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, agenda.clientId))
    .limit(1);
  const clientName = clientRows[0]?.name ?? 'Unknown Client';

  return {
    short_id: agenda.shortId,
    client_name: clientName,
    content: agenda.content,
    cycle_start: agenda.cycleStart,
    cycle_end: agenda.cycleEnd,
    shared_at: agenda.sharedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Email recipient resolution
// ---------------------------------------------------------------------------

export async function resolveEmailRecipients(
  requestRecipients: string[] | undefined,
  clientId: string,
  db: DbClient
): Promise<string[]> {
  // If request provides recipients, use them
  if (requestRecipients && requestRecipients.length > 0) {
    return requestRecipients;
  }

  // Otherwise, fetch from client config
  const clientRows = await db
    .select({ emailRecipients: clients.emailRecipients })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const client = clientRows[0];
  const emailRecipients = client?.emailRecipients as Array<{ email: string }> | null;

  if (!emailRecipients || emailRecipients.length === 0) {
    throw new BusinessError(422, 'NO_EMAIL_RECIPIENTS', 'No email recipients configured on the client and none provided in the request', {
      client_id: clientId,
    });
  }

  return emailRecipients.map((r) => r.email);
}
