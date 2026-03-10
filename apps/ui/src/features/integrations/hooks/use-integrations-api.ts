import type { IntegrationInfo } from '../types';
import { getAccessTokenAction } from '@/lib/get-token-action';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = await getAccessTokenAction();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers as Record<string, string>,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Only set Content-Type for requests that have a body
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchIntegrations(): Promise<IntegrationInfo[]> {
  const result = await apiFetch<{ integrations: IntegrationInfo[] }>(
    '/integrations'
  );
  return result.integrations;
}

export async function connectFireflies(apiKey: string, label?: string): Promise<IntegrationInfo> {
  const result = await apiFetch<{ integration: IntegrationInfo }>(
    '/integrations/fireflies/connect',
    {
      method: 'POST',
      body: JSON.stringify({ apiKey, label }),
    }
  );
  return result.integration;
}

export async function initGrainSession(): Promise<{
  sessionId: string;
  browserUrl: string;
  expiresAt: string;
}> {
  return apiFetch('/integrations/grain/init', { method: 'POST' });
}

export async function disconnectPlatform(
  platform: 'fireflies' | 'grain'
): Promise<void> {
  await apiFetch(`/integrations/${platform}/disconnect`, { method: 'POST' });
}
