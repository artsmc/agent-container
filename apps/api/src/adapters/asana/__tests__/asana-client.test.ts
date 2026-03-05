import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTaskWithRetry } from '../asana-client';
import type { AsanaCreateTaskPayload } from '../asana-client';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const SAMPLE_PAYLOAD: AsanaCreateTaskPayload = {
  workspace: 'ws-gid-001',
  projects: ['proj-gid-001'],
  name: 'Test task',
  notes: 'Test description',
  custom_fields: {},
};

function mockResponse(
  status: number,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as Response;
}

let fetchCalls: Array<{ url: string; options: RequestInit }> = [];

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createTaskWithRetry', () => {
  it('returns parsed body on 201 response', async () => {
    const responseBody = {
      data: { gid: 'asana-task-001', permalink_url: 'https://app.asana.com/0/proj/task' },
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string, opts: RequestInit) => {
      fetchCalls.push({ url: url as string, options: opts });
      return mockResponse(201, responseBody);
    }));

    const result = await createTaskWithRetry(SAMPLE_PAYLOAD, 'test-token');

    expect(result.data.gid).toBe('asana-task-001');
    expect(result.data.permalink_url).toBe('https://app.asana.com/0/proj/task');
    expect(fetchCalls).toHaveLength(1);
  });

  it('throws PUSH_FAILED on 401 without retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      mockResponse(401, { errors: [{ message: 'Not Authorized' }] }),
    ));

    await expect(
      createTaskWithRetry(SAMPLE_PAYLOAD, 'test-token'),
    ).rejects.toMatchObject({
      name: 'AdapterError',
      code: 'PUSH_FAILED',
      httpStatus: 502,
      message: 'Asana access token is invalid or expired',
    });
  });

  it('throws PUSH_FAILED on 403 without retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      mockResponse(403, {}),
    ));

    await expect(
      createTaskWithRetry(SAMPLE_PAYLOAD, 'test-token'),
    ).rejects.toMatchObject({
      code: 'PUSH_FAILED',
      message: 'Asana access denied to workspace or project',
    });
  });

  it('throws PUSH_FAILED on 404 without retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      mockResponse(404, {}),
    ));

    await expect(
      createTaskWithRetry(SAMPLE_PAYLOAD, 'test-token'),
    ).rejects.toMatchObject({
      code: 'PUSH_FAILED',
      message: 'Asana workspace or project GID not found',
    });
  });

  it('throws PUSH_FAILED on 400 with Asana error body in details', async () => {
    const errorBody = { errors: [{ message: 'custom_field is not valid' }] };

    vi.stubGlobal('fetch', vi.fn(async () =>
      mockResponse(400, errorBody),
    ));

    await expect(
      createTaskWithRetry(SAMPLE_PAYLOAD, 'test-token'),
    ).rejects.toMatchObject({
      code: 'PUSH_FAILED',
      httpStatus: 502,
      details: {
        asanaStatus: 400,
        asanaBody: errorBody,
      },
    });
  });

  it('retries on 429 then succeeds on 201', async () => {
    let callCount = 0;
    const successBody = {
      data: { gid: 'asana-task-002', permalink_url: 'https://app.asana.com/0/proj/task2' },
    };

    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse(429, {}, { 'Retry-After': '0' });
      }
      return mockResponse(201, successBody);
    }));

    const result = await createTaskWithRetry(SAMPLE_PAYLOAD, 'test-token');

    expect(result.data.gid).toBe('asana-task-002');
    expect(callCount).toBe(2);
  });

  it('throws PUSH_FAILED after 3 total attempts on 503', async () => {
    let callCount = 0;

    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++;
      return mockResponse(503, {});
    }));

    await expect(
      createTaskWithRetry(SAMPLE_PAYLOAD, 'test-token'),
    ).rejects.toMatchObject({
      code: 'PUSH_FAILED',
    });

    // 3 total attempts: initial + 2 retries
    expect(callCount).toBe(3);
  });

  it('throws PUSH_FAILED with timeout message on abort', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: RequestInit) => {
      // Simulate AbortController abort
      const error = new DOMException('The operation was aborted', 'AbortError');
      throw error;
    }));

    await expect(
      createTaskWithRetry(SAMPLE_PAYLOAD, 'test-token'),
    ).rejects.toMatchObject({
      code: 'PUSH_FAILED',
      message: 'Asana API request timed out',
    });
  });
});
