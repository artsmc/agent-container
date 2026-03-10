import type { PlatformConnector, FetchTranscriptResult, PlatformRecording } from './types';

/**
 * Rate limit tracking for Fireflies API (25 req/min sliding window).
 */
const requestTimestamps: number[] = [];
const RATE_LIMIT = 25;
const WINDOW_MS = 60_000;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  // Remove timestamps outside the window
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - WINDOW_MS) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= RATE_LIMIT) {
    const waitMs = requestTimestamps[0] + WINDOW_MS - now;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  requestTimestamps.push(Date.now());
}

/**
 * Fireflies GraphQL API transcript query.
 */
const TRANSCRIPT_QUERY = `
  query GetTranscript($id: String!) {
    transcript(id: $id) {
      id
      title
      date
      duration
      participants
      sentences {
        speaker_name
        text
        start_time
        end_time
      }
    }
  }
`;

/**
 * Fireflies GraphQL API transcripts list query.
 */
const LIST_TRANSCRIPTS_QUERY = `
  query ListTranscripts {
    transcripts {
      id
      title
      date
      duration
      participants
    }
  }
`;

/**
 * Fireflies platform connector.
 *
 * Auth: API key in Authorization header.
 * API: GraphQL at https://api.fireflies.ai/graphql
 * Rate limit: 25 requests/minute sliding window.
 */
export const firefliesConnector: PlatformConnector = {
  async listRecordings(
    credentials: Record<string, unknown>
  ): Promise<PlatformRecording[]> {
    const apiKey = credentials['apiKey'] as string;
    if (!apiKey) {
      throw new Error('Fireflies API key is required');
    }

    await enforceRateLimit();

    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: LIST_TRANSCRIPTS_QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`Fireflies API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: {
        transcripts?: Array<{
          id: string;
          title: string;
          date: string;
          duration: number;
          participants: string[];
        }>;
      };
      errors?: Array<{ message: string }>;
    };

    if (data.errors?.length) {
      throw new Error(`Fireflies API error: ${data.errors[0].message}`);
    }

    const transcripts = data.data?.transcripts ?? [];

    return transcripts.map((t) => ({
      id: t.id,
      title: t.title ?? 'Untitled',
      date: t.date ?? new Date().toISOString(),
      durationSeconds: t.duration ?? 0,
      participants: t.participants ?? [],
    }));
  },

  async fetchTranscript(
    credentials: Record<string, unknown>,
    recordingId: string
  ): Promise<FetchTranscriptResult> {
    const apiKey = credentials['apiKey'] as string;
    if (!apiKey) {
      throw new Error('Fireflies API key is required');
    }

    await enforceRateLimit();

    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: TRANSCRIPT_QUERY,
        variables: { id: recordingId },
      }),
    });

    if (!response.ok) {
      throw new Error(`Fireflies API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: {
        transcript?: {
          id: string;
          title: string;
          date: string;
          duration: number;
          participants: string[];
          sentences: Array<{
            speaker_name: string;
            text: string;
            start_time: number;
            end_time: number;
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (data.errors?.length) {
      throw new Error(`Fireflies API error: ${data.errors[0].message}`);
    }

    const transcript = data.data?.transcript;
    if (!transcript) {
      throw new Error(`Transcript not found: ${recordingId}`);
    }

    // Convert sentences to SRT-like format for our parser
    const srtLines: string[] = [];
    for (let i = 0; i < transcript.sentences.length; i++) {
      const s = transcript.sentences[i];
      const startTime = formatSrtTime(s.start_time);
      const endTime = formatSrtTime(s.end_time);
      srtLines.push(`${i + 1}`);
      srtLines.push(`${startTime} --> ${endTime}`);
      srtLines.push(`${s.speaker_name}: ${s.text}`);
      srtLines.push('');
    }

    return {
      rawText: srtLines.join('\n'),
      platformMeta: {
        title: transcript.title,
        meetingDate: transcript.date,
        participants: transcript.participants ?? [],
        durationSeconds: transcript.duration ?? null,
      },
    };
  },

  async registerWebhook(
    credentials: Record<string, unknown>,
    webhookUrl: string
  ): Promise<string> {
    const apiKey = credentials['apiKey'] as string;
    if (!apiKey) {
      throw new Error('Fireflies API key is required');
    }

    await enforceRateLimit();

    const mutation = `
      mutation AddWebhook($input: WebhookInput!) {
        addWebhook(input: $input) {
          id
        }
      }
    `;

    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            url: webhookUrl,
            events: ['Transcription completed'],
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Fireflies webhook registration failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: { addWebhook?: { id: string } };
      errors?: Array<{ message: string }>;
    };

    if (data.errors?.length) {
      throw new Error(`Fireflies webhook error: ${data.errors[0].message}`);
    }

    return data.data?.addWebhook?.id ?? '';
  },
};

/**
 * Formats seconds to SRT timestamp format: HH:MM:SS,mmm
 */
function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}
