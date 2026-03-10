import type { PlatformConnector, FetchTranscriptResult, PlatformRecording } from './types';

/**
 * Rate limit tracking for Grain API (100 req/min sliding window).
 */
const requestTimestamps: number[] = [];
const RATE_LIMIT = 100;
const WINDOW_MS = 60_000;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - WINDOW_MS) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= RATE_LIMIT) {
    const waitMs = requestTimestamps[0] + WINDOW_MS - now;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  requestTimestamps.push(Date.now());
}

const GRAIN_API_BASE = 'https://api.grain.com/v1';

interface GrainCredentials {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

function extractCredentials(credentials: Record<string, unknown>): GrainCredentials {
  const accessToken = credentials['accessToken'] as string;
  const refreshToken = credentials['refreshToken'] as string;
  const clientId = credentials['clientId'] as string;
  const clientSecret = credentials['clientSecret'] as string;

  if (!accessToken || !refreshToken) {
    throw new Error('Grain access token and refresh token are required');
  }

  return { accessToken, refreshToken, clientId, clientSecret };
}

/**
 * Refreshes the Grain access token using the refresh token.
 * Returns the new access token or throws if refresh fails.
 */
async function refreshAccessToken(
  creds: GrainCredentials
): Promise<string> {
  const response = await fetch('https://api.grain.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Grain token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
  };

  return data.access_token;
}

/**
 * Makes an authenticated Grain API request with refresh-on-401 retry.
 */
async function grainFetch(
  path: string,
  creds: GrainCredentials
): Promise<unknown> {
  await enforceRateLimit();

  let response = await fetch(`${GRAIN_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      Accept: 'application/json',
    },
  });

  // Refresh-on-use: catch 401, refresh token, retry once
  if (response.status === 401) {
    const newToken = await refreshAccessToken(creds);
    creds.accessToken = newToken;

    await enforceRateLimit();
    response = await fetch(`${GRAIN_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${newToken}`,
        Accept: 'application/json',
      },
    });
  }

  if (!response.ok) {
    throw new Error(`Grain API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Grain platform connector.
 *
 * Auth: OAuth2 bearer token with refresh-on-use.
 * API: REST at https://api.grain.com/v1
 * Rate limit: 100 requests/minute sliding window.
 */
export const grainConnector: PlatformConnector = {
  async listRecordings(
    credentials: Record<string, unknown>
  ): Promise<PlatformRecording[]> {
    const creds = extractCredentials(credentials);

    const data = (await grainFetch('/recordings', creds)) as {
      recordings: Array<{
        id: string;
        title: string;
        created_at: string;
        duration: number;
        participants: Array<{ name: string; email?: string }>;
      }>;
    };

    const recordings = data.recordings ?? [];

    return recordings.map((r) => ({
      id: r.id,
      title: r.title ?? 'Untitled',
      date: r.created_at ?? new Date().toISOString(),
      durationSeconds: r.duration ?? 0,
      participants: r.participants?.map((p) => p.name) ?? [],
    }));
  },

  async fetchTranscript(
    credentials: Record<string, unknown>,
    recordingId: string
  ): Promise<FetchTranscriptResult> {
    const creds = extractCredentials(credentials);

    // Fetch recording metadata
    const recording = (await grainFetch(
      `/recordings/${recordingId}`,
      creds
    )) as {
      id: string;
      title: string;
      created_at: string;
      duration: number;
      participants: Array<{ name: string; email?: string }>;
    };

    // Fetch transcript content
    const transcriptData = (await grainFetch(
      `/recordings/${recordingId}/transcript`,
      creds
    )) as {
      segments: Array<{
        speaker: string;
        text: string;
        start_time: number;
        end_time: number;
      }>;
    };

    // Convert to turn-based format for our parser
    const lines: string[] = [];
    for (const segment of transcriptData.segments) {
      lines.push(`**${segment.speaker}**: ${segment.text}`);
    }

    return {
      rawText: lines.join('\n'),
      platformMeta: {
        title: recording.title ?? null,
        meetingDate: recording.created_at ?? null,
        participants: recording.participants?.map((p) => p.name) ?? [],
        durationSeconds: recording.duration ?? null,
      },
    };
  },

  async registerWebhook(
    credentials: Record<string, unknown>,
    webhookUrl: string
  ): Promise<string> {
    const creds = extractCredentials(credentials);

    await enforceRateLimit();

    const response = await fetch(`${GRAIN_API_BASE}/webhooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: ['recording.transcript_ready'],
      }),
    });

    // Retry on 401
    if (response.status === 401) {
      const newToken = await refreshAccessToken(creds);

      await enforceRateLimit();
      const retryResponse = await fetch(`${GRAIN_API_BASE}/webhooks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${newToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          events: ['recording.transcript_ready'],
        }),
      });

      if (!retryResponse.ok) {
        throw new Error(`Grain webhook registration failed: ${retryResponse.status}`);
      }

      const data = (await retryResponse.json()) as { id: string };
      return data.id;
    }

    if (!response.ok) {
      throw new Error(`Grain webhook registration failed: ${response.status}`);
    }

    const data = (await response.json()) as { id: string };
    return data.id;
  },
};
