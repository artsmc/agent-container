/**
 * Ingest tools for the Mastra runtime.
 *
 * Provides tools for ingesting transcripts via the iExcel API — both raw
 * text and platform URL imports (Fireflies, Grain).
 *
 * @see Feature 19 — Intake Agent
 */
import { createTool } from '@mastra/core/tools';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { z } from 'zod';
import { getApiClient, getServiceToken } from '../api-client.js';
import { env } from '../config/env.js';
import { extractToken } from '../mcp-tools/helpers/extract-token.js';
import { createUserApiClient } from '../mcp-tools/helpers/create-user-api-client.js';

// ── Helper: authenticated fetch to the API ──────────────────────────────────

async function apiFetch(
  method: string,
  path: string,
  body?: unknown,
  userToken?: string | null,
): Promise<Response> {
  const token = userToken ?? await getServiceToken();

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (body) headers['Content-Type'] = 'application/json';

  return fetch(`${env.API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── ingestTranscript ─────────────────────────────────────────────────────────

export const ingestTranscript = createTool({
  id: 'ingest-transcript',
  description:
    'Ingests raw transcript text by sending it to the API for parsing and storage. Returns the transcript ID, version ID, and detected format. The user can paste a transcript directly and this tool will store it.',
  inputSchema: z.object({
    rawText: z
      .string()
      .min(50)
      .describe('The raw transcript text to ingest (minimum 50 characters)'),
    clientId: z
      .string()
      .uuid()
      .optional()
      .describe('Client UUID to associate the transcript with'),
    meetingType: z
      .enum(['client_call', 'intake', 'follow_up'])
      .optional()
      .describe('Type of meeting. Defaults to "intake" if not provided'),
    callDate: z
      .string()
      .optional()
      .describe('ISO 8601 date/time of the call. Defaults to current date/time if not provided'),
  }),
  outputSchema: z.object({
    transcriptId: z.string(),
    versionId: z.string(),
    format: z.string(),
  }),
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    const apiClient = userToken ? createUserApiClient(userToken) : getApiClient();

    const result = await apiClient.parseTranscript({
      rawText: input.rawText,
      clientId: input.clientId,
      callType: input.meetingType ?? 'intake',
      callDate: input.callDate ?? new Date().toISOString(),
    });

    return {
      transcriptId: result.transcriptId,
      versionId: result.versionId,
      format: result.format,
    };
  },
});

// ── checkSessionStatus ───────────────────────────────────────────────────────

export const checkSessionStatus = createTool({
  id: 'check-session-status',
  description:
    'Checks whether an integration session has been completed by the user. Use this after sending a connect URL to verify the user finished entering their credentials. Pass the same sessionId and platform you received from connectPlatform.',
  inputSchema: z.object({
    platform: z
      .enum(['fireflies', 'grain'])
      .describe('The platform the session was created for'),
    sessionId: z
      .string()
      .uuid()
      .describe('The session ID returned by connectPlatform'),
  }),
  outputSchema: z.object({
    status: z.enum(['pending', 'complete', 'expired']),
    platform: z.string(),
    expiresAt: z.string().optional(),
  }),
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    try {
      const res = await apiFetch(
        'GET',
        `/connect/${input.platform}/session/${input.sessionId}`,
        undefined,
        userToken,
      );

      if (!res.ok) {
        return { status: 'expired' as const, platform: input.platform };
      }

      const data = await res.json() as {
        status: string;
        platform: string;
        expiresAt: string;
      };

      return {
        status: data.status as 'pending' | 'complete' | 'expired',
        platform: data.platform,
        expiresAt: data.expiresAt,
      };
    } catch {
      return { status: 'expired' as const, platform: input.platform };
    }
  },
});

// ── listRecordings ───────────────────────────────────────────────────────────

export const listRecordings = createTool({
  id: 'list-recordings',
  description:
    'Lists available recordings from a connected meeting platform (Fireflies or Grain). Use this to show the user which recordings can be imported.',
  inputSchema: z.object({
    platform: z
      .enum(['fireflies', 'grain'])
      .describe('Which connected platform to list recordings from'),
  }),
  outputSchema: z.object({
    recordings: z.array(z.object({
      id: z.string(),
      title: z.string().optional(),
      date: z.string().optional(),
      duration: z.number().optional(),
      participants: z.array(z.string()).optional(),
    })),
    error: z.string().optional(),
  }),
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    try {
      const res = await apiFetch(
        'GET',
        `/transcripts/available?platform=${input.platform}`,
        undefined,
        userToken,
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        const errObj = data['error'] as Record<string, unknown> | undefined;
        return {
          recordings: [],
          error: errObj?.['message'] as string ?? `API returned ${res.status}`,
        };
      }

      const data = await res.json() as { recordings: Array<Record<string, unknown>> };
      return {
        recordings: (data.recordings ?? []).map((r) => ({
          id: String(r['id'] ?? r['recordingId'] ?? ''),
          title: (r['title'] ?? r['name'] ?? '') as string,
          date: (r['date'] ?? r['meetingDate'] ?? r['created_at'] ?? '') as string,
          duration: (r['duration'] ?? r['durationSeconds'] ?? undefined) as number | undefined,
          participants: (r['participants'] ?? []) as string[],
        })),
      };
    } catch (err) {
      return {
        recordings: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

// ── importFromUrl ────────────────────────────────────────────────────────────

export const importFromUrl = createTool({
  id: 'import-from-url',
  description:
    'Imports a transcript from a Fireflies or Grain URL. Auto-detects the platform, fetches the transcript, and stores it. Use this when the user provides a recording URL.',
  inputSchema: z.object({
    url: z
      .string()
      .url()
      .describe('URL of the recording (Fireflies or Grain)'),
    clientId: z
      .string()
      .uuid()
      .optional()
      .describe('Client UUID to associate the transcript with'),
    meetingType: z
      .enum(['client_call', 'intake', 'follow_up'])
      .optional()
      .describe('Type of meeting'),
  }),
  outputSchema: z.object({
    transcriptId: z.string().optional(),
    versionId: z.string().optional(),
    format: z.string().optional(),
    detectedPlatform: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    try {
      const res = await apiFetch('POST', '/transcripts/from-url', {
        url: input.url,
        clientId: input.clientId,
        meetingType: input.meetingType,
      }, userToken);

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        const errObj = data['error'] as Record<string, unknown> | undefined;
        return {
          error: errObj?.['message'] as string ?? `API returned ${res.status}`,
        };
      }

      const data = await res.json() as Record<string, unknown>;
      return {
        transcriptId: data['transcriptId'] as string,
        versionId: data['versionId'] as string,
        format: data['format'] as string,
        detectedPlatform: data['detectedPlatform'] as string,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

// ── checkIntegrationStatus ───────────────────────────────────────────────────

export const checkIntegrationStatus = createTool({
  id: 'check-integration-status',
  description:
    'Checks whether a meeting platform integration (Fireflies or Grain) is connected. Use this before attempting to list or import recordings to verify the integration is set up.',
  inputSchema: z.object({
    platform: z
      .enum(['fireflies', 'grain'])
      .describe('Which platform to check'),
  }),
  outputSchema: z.object({
    connected: z.boolean(),
    platform: z.string(),
    integrationId: z.string().optional(),
    label: z.string().optional(),
    lastSyncAt: z.string().nullable().optional(),
  }),
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    try {
      const res = await apiFetch('GET', '/integrations', undefined, userToken);
      if (!res.ok) {
        return { connected: false, platform: input.platform };
      }

      const data = await res.json() as {
        integrations: Array<{
          id: string;
          platform: string;
          status: string;
          label?: string;
          lastSyncAt?: string;
        }>;
      };

      const match = (data.integrations ?? []).find(
        (i) => i.platform === input.platform && i.status === 'connected',
      );

      if (match) {
        return {
          connected: true,
          platform: input.platform,
          integrationId: match.id,
          label: match.label,
          lastSyncAt: match.lastSyncAt,
        };
      }

      return { connected: false, platform: input.platform };
    } catch {
      return { connected: false, platform: input.platform };
    }
  },
});

// ── connectPlatform ──────────────────────────────────────────────────────────

export const connectPlatform = createTool({
  id: 'connect-platform',
  description:
    'Connects a meeting platform integration. For Fireflies: if the user provides their API key, pass it to connect directly. For any platform: if no API key is provided, generates a secure temporary URL the user can visit to enter their credentials.',
  inputSchema: z.object({
    platform: z
      .enum(['fireflies', 'grain'])
      .describe('Which platform to connect'),
    apiKey: z
      .string()
      .optional()
      .describe('For Fireflies: the user\'s API key. If provided, connects directly without needing a browser URL.'),
    label: z
      .string()
      .optional()
      .describe('Optional display label for the integration'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    method: z.enum(['direct', 'session_url']).optional(),
    browserUrl: z.string().optional(),
    expiresAt: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    try {
      // If API key provided (Fireflies), connect directly
      if (input.apiKey && input.platform === 'fireflies') {
        const res = await apiFetch('POST', `/integrations/${input.platform}/connect`, {
          apiKey: input.apiKey,
          label: input.label,
        }, userToken);

        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as Record<string, unknown>;
          const errObj = data['error'] as Record<string, unknown> | undefined;
          return {
            success: false,
            error: errObj?.['message'] as string ?? `API returned ${res.status}`,
          };
        }

        return { success: true, method: 'direct' as const };
      }

      // Otherwise, generate a session URL for browser-based credential entry
      const res = await apiFetch('POST', `/integrations/${input.platform}/init`, undefined, userToken);

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        const errObj = data['error'] as Record<string, unknown> | undefined;
        return {
          success: false,
          error: errObj?.['message'] as string ?? `API returned ${res.status}`,
        };
      }

      const data = await res.json() as {
        sessionId: string;
        browserUrl: string;
        expiresAt: string;
      };

      return {
        success: true,
        method: 'session_url' as const,
        browserUrl: data.browserUrl,
        expiresAt: data.expiresAt,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

// ── importRecordings ─────────────────────────────────────────────────────────

export const importRecordings = createTool({
  id: 'import-recordings',
  description:
    'Imports one or more recordings from a connected platform by their IDs. Use listRecordings first to find available recording IDs, then import them.',
  inputSchema: z.object({
    platform: z
      .enum(['fireflies', 'grain'])
      .describe('Which platform the recordings are from'),
    recordingIds: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe('Array of recording IDs to import'),
    clientId: z
      .string()
      .uuid()
      .optional()
      .describe('Client UUID to associate imported transcripts with'),
    meetingType: z
      .enum(['client_call', 'intake', 'follow_up'])
      .optional()
      .describe('Type of meeting for all imported recordings'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      recordingId: z.string(),
      success: z.boolean(),
      transcriptId: z.string().optional(),
      error: z.string().optional(),
    })),
  }),
  execute: async (input, context: ToolExecutionContext) => {
    const userToken = extractToken(context);
    try {
      const res = await apiFetch('POST', '/transcripts/import', {
        platform: input.platform,
        recordingIds: input.recordingIds,
        clientId: input.clientId,
        meetingType: input.meetingType,
      }, userToken);

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        const errObj = data['error'] as Record<string, unknown> | undefined;
        return {
          results: input.recordingIds.map((id) => ({
            recordingId: id,
            success: false,
            error: errObj?.['message'] as string ?? `API returned ${res.status}`,
          })),
        };
      }

      const data = await res.json() as { results: Array<Record<string, unknown>> };
      return {
        results: (data.results ?? []).map((r) => ({
          recordingId: String(r['recordingId'] ?? ''),
          success: Boolean(r['success']),
          transcriptId: r['transcriptId'] as string | undefined,
          error: r['error'] as string | undefined,
        })),
      };
    } catch (err) {
      return {
        results: input.recordingIds.map((id) => ({
          recordingId: id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })),
      };
    }
  },
});
