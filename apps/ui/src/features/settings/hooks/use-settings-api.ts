/**
 * Client-side API helper for Admin Settings.
 *
 * Uses fetch with credentials to call the API through the Next.js proxy.
 * The API base URL is derived from NEXT_PUBLIC_API_BASE_URL or defaults
 * to relative paths (assumes a reverse proxy is configured).
 */

import type {
  SettingsAsanaWorkspace,
  SettingsProductUser,
  AuditLogResponse,
  AuditFilters,
  EmailConfig,
  EmailTemplate,
} from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Asana Workspaces
// ---------------------------------------------------------------------------

export async function fetchAsanaWorkspaces(): Promise<SettingsAsanaWorkspace[]> {
  return apiFetch<SettingsAsanaWorkspace[]>('/asana/workspaces');
}

export async function addAsanaWorkspace(body: {
  name: string;
  accessToken: string;
  asanaWorkspaceId: string;
}): Promise<SettingsAsanaWorkspace> {
  return apiFetch<SettingsAsanaWorkspace>('/asana/workspaces', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteAsanaWorkspace(id: string): Promise<void> {
  return apiFetch<void>(`/asana/workspaces/${id}`, { method: 'DELETE' });
}

export async function testAsanaConnection(
  id: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/asana/workspaces/${id}/test`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Users & Roles
// ---------------------------------------------------------------------------

export async function fetchAdminUsers(): Promise<SettingsProductUser[]> {
  return apiFetch<SettingsProductUser[]>('/admin/users');
}

export async function updateUserRole(
  userId: string,
  role: string
): Promise<SettingsProductUser> {
  return apiFetch<SettingsProductUser>(`/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function updateUserClients(
  userId: string,
  clientIds: string[]
): Promise<SettingsProductUser> {
  return apiFetch<SettingsProductUser>(`/users/${userId}/clients`, {
    method: 'PATCH',
    body: JSON.stringify({ clientIds }),
  });
}

export async function deactivateUser(userId: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/deactivate`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Email Config & Templates
// ---------------------------------------------------------------------------

export async function fetchEmailConfig(): Promise<EmailConfig> {
  return apiFetch<EmailConfig>('/email/config');
}

export async function saveEmailConfig(config: EmailConfig): Promise<void> {
  return apiFetch<void>('/email/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  return apiFetch<EmailTemplate[]>('/email/templates');
}

export async function saveEmailTemplate(
  id: string,
  content: string
): Promise<EmailTemplate> {
  return apiFetch<EmailTemplate>(`/email/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export async function fetchAuditLog(
  filters: AuditFilters,
  page: number,
  limit: number
): Promise<AuditLogResponse> {
  const params = new URLSearchParams();
  if (filters.userId) params.set('user_id', filters.userId);
  if (filters.entityType) params.set('entity_type', filters.entityType);
  if (filters.action) params.set('action', filters.action);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  params.set('page', String(page));
  params.set('limit', String(limit));

  const qs = params.toString();
  return apiFetch<AuditLogResponse>(`/audit?${qs}`);
}

// ---------------------------------------------------------------------------
// Clients (for user edit panel multi-select)
// ---------------------------------------------------------------------------

export interface ClientOption {
  id: string;
  name: string;
}

export async function fetchClients(): Promise<ClientOption[]> {
  const response = await apiFetch<{ data: ClientOption[] }>('/clients');
  return response.data;
}
