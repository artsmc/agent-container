/**
 * Product Database Schema -- Drizzle ORM
 *
 * This file defines the complete product database schema for the iExcel
 * automation system. All tables, enums, indexes, constraints, and relations
 * are defined here using Drizzle ORM's pgTable/pgEnum primitives.
 *
 * Trigger functions (short ID generation and immutability guards) are NOT
 * defined here -- they must be applied via raw SQL in triggers.sql, as Drizzle
 * does not natively support Postgres triggers.
 *
 * Database: PostgreSQL 15+
 * Encoding: UTF-8
 * Timezone: All TIMESTAMPTZ columns store UTC values.
 */

import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  interval,
  jsonb,
  integer,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Lifecycle statuses for a task.
 * - draft: Agent-generated, not yet reviewed.
 * - approved: Reviewed and approved. Ready to push.
 * - rejected: Reviewed and explicitly rejected.
 * - pushed: Successfully pushed to external PM system.
 * - completed: Set by historical import (Feature 38) or reconciliation (Feature 13) only.
 */
export const taskStatusEnum = pgEnum('task_status', [
  'draft',
  'approved',
  'rejected',
  'pushed',
  'completed',
]);

/**
 * Lifecycle statuses for an agenda (Running Notes document).
 */
export const agendaStatusEnum = pgEnum('agenda_status', [
  'draft',
  'in_review',
  'finalized',
  'shared',
]);

/**
 * Type of meeting from which a transcript was generated.
 */
export const callTypeEnum = pgEnum('call_type', [
  'client_call',
  'intake',
  'follow_up',
]);

/**
 * Product-level user roles.
 */
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'account_manager',
  'team_member',
]);

/**
 * Source of an edit or audit action.
 */
export const editSourceEnum = pgEnum('edit_source', [
  'agent',
  'ui',
  'terminal',
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * Product-level user profile.
 * Identity (email, authentication) is owned by the auth service (apps/auth).
 * This table stores product-specific role and is the FK target for approval,
 * editing, and audit attribution throughout the schema.
 *
 * Rows are created via just-in-time provisioning on first SSO login.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authUserId: varchar('auth_user_id', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 320 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('team_member'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // idx_users_auth_user_id: UNIQUE -- already created by .unique() on authUserId
  index('idx_users_email').on(table.email),
]);

/**
 * Registry of configured Asana workspace connections.
 * access_token_ref stores a reference key to a secrets manager (e.g., Vault
 * path, AWS Secrets Manager ARN), NOT the actual OAuth token.
 */
export const asanaWorkspaces = pgTable('asana_workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  asanaWorkspaceId: varchar('asana_workspace_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  accessTokenRef: varchar('access_token_ref', { length: 500 }).notNull(),
  /**
   * Per-workspace Asana custom field GID configuration.
   * JSONB shape: {
   *   clientFieldGid: string,
   *   scrumStageFieldGid: string,
   *   estimatedTimeFieldGid: string,
   *   estimatedTimeFormat: "h_m" | "hh_mm"
   * }
   */
  customFieldConfig: jsonb('custom_field_config').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The central organizing entity. Every other business entity references a client.
 *
 * email_recipients JSONB shape:
 *   Array<{ name: string; email: string; role?: string }>
 *   Defaults to '[]'::jsonb. NOT NULL.
 */
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  grainPlaylistId: varchar('grain_playlist_id', { length: 255 }),
  defaultAsanaWorkspaceId: varchar('default_asana_workspace_id', { length: 255 }),
  defaultAsanaProjectId: varchar('default_asana_project_id', { length: 255 }),
  emailRecipients: jsonb('email_recipients').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Many-to-many join table for user-client access control.
 * Determines which clients a non-admin user can access.
 */
export const clientUsers = pgTable('client_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  role: varchar('role', { length: 50 }).default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_client_users_client_user').on(table.clientId, table.userId),
]);

/**
 * Raw and processed call transcripts.
 *
 * normalized_segments JSONB shape:
 *   Array<{ speaker: string; timestamp: number; text: string }>
 *   Matches TranscriptSegment from @iexcel/shared-types.
 */
export const transcripts = pgTable('transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  grainCallId: varchar('grain_call_id', { length: 255 }),
  callType: callTypeEnum('call_type').notNull(),
  callDate: timestamp('call_date', { withTimezone: true }).notNull(),
  rawTranscript: text('raw_transcript'),
  normalizedSegments: jsonb('normalized_segments'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  isImported: boolean('is_imported').notNull().default(false),
  importedAt: timestamp('imported_at', { withTimezone: true }),
  importSource: varchar('import_source', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_transcripts_client_date').on(table.clientId, table.callDate),
  index('idx_transcripts_client_grain_imported')
    .on(table.clientId, table.grainCallId)
    .where(sql`${table.isImported} = true`),
]);

/**
 * Generated tasks with full lifecycle tracking.
 *
 * short_id: Human-readable ID (e.g., TSK-0001). Auto-generated by a BEFORE
 * INSERT trigger using tsk_short_id_seq. Immutable after insertion (guarded
 * by a BEFORE UPDATE trigger).
 *
 * description JSONB shape (TaskDescription from @iexcel/shared-types):
 *   { taskContext: string; additionalContext: string; requirements: string[] }
 *
 * external_ref JSONB shape (ExternalRef from @iexcel/shared-types):
 *   { system: string; externalId: string | null; externalUrl: string | null;
 *     projectId: string | null; workspaceId: string | null }
 *   Replaces Asana-specific fields to support multiple PM tools.
 *
 * tags JSONB shape: string[] (e.g., ["billing", "follow-up", "urgent"])
 *
 * priority: Must be one of 'low', 'medium', 'high', 'critical'.
 *   Enforced by a CHECK constraint.
 */
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  shortId: varchar('short_id', { length: 20 }).notNull().unique(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  transcriptId: uuid('transcript_id')
    .references(() => transcripts.id, { onDelete: 'set null' }),
  status: taskStatusEnum('status').notNull().default('draft'),
  title: varchar('title', { length: 500 }).notNull(),
  description: jsonb('description'),
  assignee: varchar('assignee', { length: 255 }),
  estimatedTime: interval('estimated_time'),
  scrumStage: varchar('scrum_stage', { length: 100 }).notNull().default('Backlog'),
  externalRef: jsonb('external_ref'),
  priority: varchar('priority', { length: 50 }),
  tags: jsonb('tags').default(sql`'[]'::jsonb`),
  dueDate: date('due_date'),
  approvedBy: uuid('approved_by')
    .references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  pushedAt: timestamp('pushed_at', { withTimezone: true }),
  isImported: boolean('is_imported').notNull().default(false),
  importedAt: timestamp('imported_at', { withTimezone: true }),
  importSource: varchar('import_source', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('chk_tasks_priority', sql`${table.priority} IN ('low', 'medium', 'high', 'critical')`),
  // idx_tasks_short_id: UNIQUE -- already created by .unique() on shortId
  index('idx_tasks_client_status').on(table.clientId, table.status),
  index('idx_tasks_transcript_id').on(table.transcriptId),
  index('idx_tasks_client_asana_imported')
    .on(table.clientId)
    .where(sql`${table.isImported} = true`),
]);

/**
 * Immutable edit history for tasks. One row appended per edit.
 * Version 1 is the agent-generated original.
 * Rows are never updated or deleted (except via CASCADE when parent task is deleted).
 */
export const taskVersions = pgTable('task_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  description: jsonb('description'),
  estimatedTime: interval('estimated_time'),
  editedBy: uuid('edited_by')
    .references(() => users.id, { onDelete: 'set null' }),
  source: editSourceEnum('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_task_versions_task_version').on(table.taskId, table.version),
]);

/**
 * Generated Running Notes documents with lifecycle tracking.
 *
 * short_id: Human-readable ID (e.g., AGD-0001). Auto-generated by a BEFORE
 * INSERT trigger using agd_short_id_seq. Immutable after insertion.
 *
 * content: ProseMirror JSON stored as JSONB for rich text editing.
 *
 * Constraint: cycle_end >= cycle_start when both are non-null.
 */
export const agendas = pgTable('agendas', {
  id: uuid('id').primaryKey().defaultRandom(),
  shortId: varchar('short_id', { length: 20 }).notNull().unique(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  status: agendaStatusEnum('status').notNull().default('draft'),
  content: jsonb('content'),
  cycleStart: date('cycle_start'),
  cycleEnd: date('cycle_end'),
  sharedUrlToken: varchar('shared_url_token', { length: 128 }).unique(),
  internalUrlToken: varchar('internal_url_token', { length: 128 }).unique(),
  googleDocId: varchar('google_doc_id', { length: 255 }),
  finalizedBy: uuid('finalized_by')
    .references(() => users.id, { onDelete: 'set null' }),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  sharedAt: timestamp('shared_at', { withTimezone: true }),
  isImported: boolean('is_imported').notNull().default(false),
  importedAt: timestamp('imported_at', { withTimezone: true }),
  importSource: varchar('import_source', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('chk_cycle_dates', sql`${table.cycleEnd} IS NULL OR ${table.cycleStart} IS NULL OR ${table.cycleEnd} >= ${table.cycleStart}`),
  // idx_agendas_short_id: UNIQUE -- already created by .unique() on shortId
  index('idx_agendas_client_status').on(table.clientId, table.status),
  // Partial index for shared token lookups (excludes null tokens)
  index('idx_agendas_shared_token')
    .on(table.sharedUrlToken)
    .where(sql`${table.sharedUrlToken} IS NOT NULL`),
]);

/**
 * Immutable edit history for agendas. One row appended per edit.
 * Version 1 is the agent-generated original.
 */
export const agendaVersions = pgTable('agenda_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  agendaId: uuid('agenda_id')
    .notNull()
    .references(() => agendas.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: jsonb('content'),
  editedBy: uuid('edited_by')
    .references(() => users.id, { onDelete: 'set null' }),
  source: editSourceEnum('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_agenda_versions_agenda_version').on(table.agendaId, table.version),
]);

/**
 * Append-only log of every significant system action.
 * Rows are never updated or deleted.
 *
 * action examples: 'task.created', 'task.approved', 'agenda.shared', 'agenda.emailed'
 * entity_type examples: 'task', 'agenda', 'transcript', 'client'
 *
 * metadata JSONB shape: Record<string, unknown> -- flexible per action type.
 */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  metadata: jsonb('metadata'),
  source: editSourceEnum('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_audit_entity').on(table.entityType, table.entityId),
  index('idx_audit_user_date').on(table.userId, table.createdAt),
]);

/**
 * Import job lifecycle statuses.
 */
export const importJobStatusEnum = pgEnum('import_job_status', [
  'pending',
  'in_progress',
  'completed',
  'failed',
]);

/**
 * Tracks the lifecycle and progress of a historical import job (Feature 38).
 */
export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  status: importJobStatusEnum('status').notNull().default('pending'),
  grainPlaylistId: varchar('grain_playlist_id', { length: 500 }),
  asanaProjectId: varchar('asana_project_id', { length: 255 }),
  asanaWorkspaceId: varchar('asana_workspace_id', { length: 255 }),
  reprocessTranscripts: boolean('reprocess_transcripts').notNull().default(false),
  callTypeOverride: varchar('call_type_override', { length: 50 }),
  transcriptsTotal: integer('transcripts_total'),
  transcriptsImported: integer('transcripts_imported').notNull().default(0),
  tasksTotal: integer('tasks_total'),
  tasksImported: integer('tasks_imported').notNull().default(0),
  agendasTotal: integer('agendas_total'),
  agendasImported: integer('agendas_imported').notNull().default(0),
  errorSummary: text('error_summary'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_import_jobs_client_id').on(table.clientId, table.createdAt),
  index('idx_import_jobs_status')
    .on(table.status)
    .where(sql`${table.status} IN ('pending', 'in_progress')`),
]);

/**
 * Per-record error log for import jobs (Feature 38).
 */
export const importJobErrors = pgTable('import_job_errors', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => importJobs.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  sourceId: varchar('source_id', { length: 500 }).notNull(),
  errorCode: varchar('error_code', { length: 100 }).notNull(),
  errorMessage: text('error_message').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_import_job_errors_job_id').on(table.jobId),
]);

// ---------------------------------------------------------------------------
// Relations (Drizzle relation declarations for query builder)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  clientUsers: many(clientUsers),
  approvedTasks: many(tasks, { relationName: 'approvedBy' }),
  editedTaskVersions: many(taskVersions),
  editedAgendaVersions: many(agendaVersions),
  finalizedAgendas: many(agendas, { relationName: 'finalizedBy' }),
  auditEntries: many(auditLog),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  clientUsers: many(clientUsers),
  transcripts: many(transcripts),
  tasks: many(tasks),
  agendas: many(agendas),
  importJobs: many(importJobs),
}));

export const clientUsersRelations = relations(clientUsers, ({ one }) => ({
  client: one(clients, {
    fields: [clientUsers.clientId],
    references: [clients.id],
  }),
  user: one(users, {
    fields: [clientUsers.userId],
    references: [users.id],
  }),
}));

export const transcriptsRelations = relations(transcripts, ({ one, many }) => ({
  client: one(clients, {
    fields: [transcripts.clientId],
    references: [clients.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  client: one(clients, {
    fields: [tasks.clientId],
    references: [clients.id],
  }),
  transcript: one(transcripts, {
    fields: [tasks.transcriptId],
    references: [transcripts.id],
  }),
  approver: one(users, {
    fields: [tasks.approvedBy],
    references: [users.id],
    relationName: 'approvedBy',
  }),
  versions: many(taskVersions),
}));

export const taskVersionsRelations = relations(taskVersions, ({ one }) => ({
  task: one(tasks, {
    fields: [taskVersions.taskId],
    references: [tasks.id],
  }),
  editor: one(users, {
    fields: [taskVersions.editedBy],
    references: [users.id],
  }),
}));

export const agendasRelations = relations(agendas, ({ one, many }) => ({
  client: one(clients, {
    fields: [agendas.clientId],
    references: [clients.id],
  }),
  finalizer: one(users, {
    fields: [agendas.finalizedBy],
    references: [users.id],
    relationName: 'finalizedBy',
  }),
  versions: many(agendaVersions),
}));

export const agendaVersionsRelations = relations(agendaVersions, ({ one }) => ({
  agenda: one(agendas, {
    fields: [agendaVersions.agendaId],
    references: [agendas.id],
  }),
  editor: one(users, {
    fields: [agendaVersions.editedBy],
    references: [users.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

export const importJobsRelations = relations(importJobs, ({ one, many }) => ({
  client: one(clients, {
    fields: [importJobs.clientId],
    references: [clients.id],
  }),
  createdByUser: one(users, {
    fields: [importJobs.createdBy],
    references: [users.id],
  }),
  errors: many(importJobErrors),
}));

export const importJobErrorsRelations = relations(importJobErrors, ({ one }) => ({
  job: one(importJobs, {
    fields: [importJobErrors.jobId],
    references: [importJobs.id],
  }),
}));
