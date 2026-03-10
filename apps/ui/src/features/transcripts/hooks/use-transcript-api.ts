import type { PlatformRecording, ImportResult, IngestResult } from '../types';
import type { IntegrationInfo } from '../../integrations/types';
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
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
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

/**
 * Fetches the user's connected integrations.
 */
export async function fetchIntegrations(): Promise<IntegrationInfo[]> {
  const result = await apiFetch<{ integrations: IntegrationInfo[] }>(
    '/integrations'
  );
  return result.integrations;
}

/**
 * Fetches available recordings from a connected platform.
 */
export async function fetchAvailableRecordings(
  platform: string
): Promise<PlatformRecording[]> {
  const result = await apiFetch<{ recordings: PlatformRecording[] }>(
    `/transcripts/available?platform=${encodeURIComponent(platform)}`
  );
  return result.recordings;
}

/**
 * Batch imports recordings from a platform.
 */
export async function importFromPlatform(
  platform: string,
  recordingIds: string[],
  clientId?: string,
  meetingType?: string
): Promise<ImportResult[]> {
  const result = await apiFetch<{ results: ImportResult[] }>(
    '/transcripts/import',
    {
      method: 'POST',
      body: JSON.stringify({
        platform,
        recordingIds,
        clientId: clientId || undefined,
        meetingType: meetingType || undefined,
      }),
    }
  );
  return result.results;
}

/**
 * Imports a transcript from a URL (auto-detects platform).
 */
export async function importFromUrl(
  url: string,
  clientId?: string,
  meetingType?: string
): Promise<IngestResult> {
  return apiFetch<IngestResult>('/transcripts/from-url', {
    method: 'POST',
    body: JSON.stringify({
      url,
      clientId: clientId || undefined,
      meetingType: meetingType || undefined,
    }),
  });
}

/**
 * Submits raw transcript text.
 */
export async function submitRawTranscript(
  rawText: string,
  clientId: string,
  callType: string,
  callDate: string
): Promise<IngestResult> {
  return apiFetch<IngestResult>('/transcripts/parse', {
    method: 'POST',
    body: JSON.stringify({
      rawText,
      clientId,
      callType,
      callDate,
    }),
  });
}
