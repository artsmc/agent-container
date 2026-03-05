/**
 * Types for the Admin Settings feature (Feature 31).
 *
 * These types represent the UI-facing shapes for settings data.
 * They match the API response contracts from TR.md Section 3.2.
 */

/** Asana workspace as returned by GET /asana/workspaces */
export interface SettingsAsanaWorkspace {
  id: string;
  name: string;
  createdAt: string;
  tokenSuffix: string;
  tokenConfigured: boolean;
}

/** Test connection state for a single workspace */
export type TestConnectionStatus = 'idle' | 'testing' | 'success' | 'failed';

/** Product user as returned by GET /admin/users */
export interface SettingsProductUser {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  role: 'admin' | 'account_manager' | 'team_member';
  isActive: boolean;
  assignedClients: Array<{ id: string; name: string }>;
}

/** Audit event as returned by GET /audit */
export interface AuditEvent {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  entityShortId: string | null;
  metadata: Record<string, unknown>;
  source: 'agent' | 'ui' | 'terminal';
  createdAt: string;
}

/** Paginated response wrapper for audit events */
export interface AuditLogResponse {
  data: AuditEvent[];
  total: number;
  page: number;
  limit: number;
}

/** Filters for the audit log */
export interface AuditFilters {
  userId: string | null;
  entityType: string | null;
  action: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

/** Email configuration shape */
export interface EmailConfig {
  senderName: string;
  senderAddress: string;
  replyToAddress: string;
}

/** Email template shape */
export interface EmailTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
  lastModified: string;
}

/** Tab identifiers for the settings page */
export type SettingsTabId = 'asana' | 'users' | 'email' | 'audit';

/** Tab definition */
export interface SettingsTab {
  id: SettingsTabId;
  label: string;
}
