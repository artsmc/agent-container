import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrainApiClient } from '../grain-client.js';
import { GrainNormalizerError } from '../errors.js';
import { ApiErrorCode } from '@iexcel/shared-types';
import type { GrainRecordingResponse } from '../grain-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrainResponse(
  overrides: Partial<GrainRecordingResponse> = {}
): GrainRecordingResponse {
  return {
    recording: {
      id: 'rec-abc123',
      created_at: '2026-02-14T10:00:00Z',
      started_at: '2026-02-14T10:05:00Z',
      duration: 3720000,
      transcript: {
        segments: [
          { speaker: 'Mark', start_time: 0, text: 'Hello.' },
          { speaker: 'Sarah', start_time: 5000, text: 'Hi.' },
        ],
      },
    },
    ...overrides,
  };
}

function mockFetch(
  responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>
): typeof fetch {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex++];
    if (!resp) {
      throw new Error('No more mock responses');
    }
    return new Response(JSON.stringify(resp.body ?? {}), {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        ...(resp.headers ?? {}),
      },
    });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GrainApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches a recording successfully', async () => {
    const responseData = makeGrainResponse();
    const fetchFn = mockFetch([{ status: 200, body: responseData }]);

    const client = new GrainApiClient({
      apiKey: 'test-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
    });

    const result = await client.fetchRecording('rec-abc123');
    expect(result.id).toBe('rec-abc123');
    expect(result.transcript!.segments).toHaveLength(2);

    // Verify auth header was set
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('/recordings/rec-abc123'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      })
    );
  });

  it('maps 404 to GRAIN_RECORDING_NOT_FOUND', async () => {
    const fetchFn = mockFetch([
      { status: 404, body: { error: 'not found' } },
    ]);

    const client = new GrainApiClient({
      apiKey: 'test-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
    });

    try {
      await client.fetchRecording('rec-missing');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GrainNormalizerError);
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainRecordingNotFound);
      expect(e.httpStatus).toBe(404);
    }
  });

  it('maps 401 to GRAIN_ACCESS_DENIED', async () => {
    const fetchFn = mockFetch([
      { status: 401, body: { error: 'unauthorized' } },
    ]);

    const client = new GrainApiClient({
      apiKey: 'bad-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
    });

    try {
      await client.fetchRecording('rec-abc123');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainAccessDenied);
      expect(e.httpStatus).toBe(403);
    }
  });

  it('maps 403 to GRAIN_ACCESS_DENIED', async () => {
    const fetchFn = mockFetch([
      { status: 403, body: { error: 'forbidden' } },
    ]);

    const client = new GrainApiClient({
      apiKey: 'test-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
    });

    try {
      await client.fetchRecording('rec-abc123');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainAccessDenied);
      expect(e.httpStatus).toBe(403);
    }
  });

  it('retries on 429 with Retry-After and succeeds', async () => {
    const responseData = makeGrainResponse();
    const fetchFn = mockFetch([
      { status: 429, body: {}, headers: { 'Retry-After': '0' } },
      { status: 200, body: responseData },
    ]);

    const client = new GrainApiClient({
      apiKey: 'test-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
      timeoutMs: 5000,
    });
    // Override sleep to avoid real delays in tests
    (client as unknown as { sleep: (ms: number) => Promise<void> }).sleep = () =>
      Promise.resolve();

    const result = await client.fetchRecording('rec-abc123');
    expect(result.id).toBe('rec-abc123');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws GRAIN_API_ERROR after retries exhausted on 429', async () => {
    const fetchFn = mockFetch([
      { status: 429, body: {}, headers: { 'Retry-After': '0' } },
      { status: 429, body: {}, headers: { 'Retry-After': '0' } },
      { status: 429, body: {}, headers: { 'Retry-After': '0' } },
    ]);

    // Use a patched client with overridden sleep to avoid real delays
    const client = new GrainApiClient({
      apiKey: 'test-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
      timeoutMs: 5000,
    });
    // Override the private sleep method to be instant
    (client as unknown as { sleep: (ms: number) => Promise<void> }).sleep = () =>
      Promise.resolve();

    try {
      await client.fetchRecording('rec-abc123');
      expect.fail('Should have thrown');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainApiError);
      expect(e.httpStatus).toBe(502);
    }
  }, 10_000);

  it('retries on 500 and succeeds on second attempt', async () => {
    const responseData = makeGrainResponse();
    const fetchFn = mockFetch([
      { status: 500, body: {} },
      { status: 200, body: responseData },
    ]);

    const client = new GrainApiClient({
      apiKey: 'test-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
      timeoutMs: 5000,
    });
    (client as unknown as { sleep: (ms: number) => Promise<void> }).sleep = () =>
      Promise.resolve();

    const result = await client.fetchRecording('rec-abc123');
    expect(result.id).toBe('rec-abc123');
  });

  it('throws GRAIN_API_ERROR on timeout', async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      // Simulate timeout by aborting
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            const err = new DOMException('The operation was aborted', 'AbortError');
            reject(err);
          });
        }
        // Trigger abort immediately by using a very short timeout
      });
    }) as unknown as typeof fetch;

    const client = new GrainApiClient({
      apiKey: 'test-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
      timeoutMs: 1, // 1ms to trigger immediate timeout
    });

    try {
      await client.fetchRecording('rec-abc123');
      expect.fail('Should have thrown');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainApiError);
      expect(e.message).toBe('Grain API request timed out');
      expect(e.httpStatus).toBe(502);
    }
  });

  it('handles pagination by concatenating segments', async () => {
    const page1: GrainRecordingResponse = {
      recording: {
        id: 'rec-long',
        created_at: '2026-02-14T10:00:00Z',
        duration: 7200000,
        transcript: {
          segments: [
            { speaker: 'Mark', start_time: 0, text: 'Segment 1.' },
            { speaker: 'Sarah', start_time: 5000, text: 'Segment 2.' },
          ],
        },
      },
      next_page_token: 'page2',
    };

    const page2: GrainRecordingResponse = {
      recording: {
        id: 'rec-long',
        created_at: '2026-02-14T10:00:00Z',
        duration: 7200000,
        transcript: {
          segments: [
            { speaker: 'Mark', start_time: 10000, text: 'Segment 3.' },
          ],
        },
      },
    };

    const fetchFn = mockFetch([
      { status: 200, body: page1 },
      { status: 200, body: page2 },
    ]);

    const client = new GrainApiClient({
      apiKey: 'test-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
    });

    const result = await client.fetchRecording('rec-long');
    expect(result.transcript!.segments).toHaveLength(3);
    expect(result.transcript!.segments[2]!.text).toBe('Segment 3.');
  });

  it('truncates pagination at 50 pages', async () => {
    // Build 51 page responses
    const responses: Array<{ status: number; body: GrainRecordingResponse }> = [];
    for (let i = 0; i < 51; i++) {
      responses.push({
        status: 200,
        body: {
          recording: {
            id: 'rec-very-long',
            created_at: '2026-02-14T10:00:00Z',
            duration: 72000000,
            transcript: {
              segments: [
                { speaker: 'Mark', start_time: i * 1000, text: `Segment ${i + 1}.` },
              ],
            },
          },
          next_page_token: i < 50 ? `page${i + 2}` : undefined,
        },
      });
    }

    const fetchFn = mockFetch(responses);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const client = new GrainApiClient({
      apiKey: 'test-key',
      baseUrl: 'https://mock.grain.com/v1',
      fetchFn,
    });

    const result = await client.fetchRecording('rec-very-long');
    // 1 initial page + 49 additional pages = 50 pages total
    expect(result.transcript!.segments).toHaveLength(50);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
