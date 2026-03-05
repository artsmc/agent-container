/**
 * Integration tests for status reconciliation.
 *
 * These tests mock the global fetch to simulate Asana API responses at the
 * HTTP level, exercising the full stack: fetchProjectTasks (pagination,
 * retry, error handling) -> reconcileTasksForClient (orchestration).
 *
 * No real network calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reconcileTasksForClient } from '../reconcile';
import { ReconciliationError } from '../reconciliation-error';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const CLIENT_ID = 'client-uuid-integration';
const ACCESS_TOKEN = 'xoxp-integration-token';

function makePushedTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides['id'] ?? 'task-uuid-001',
    shortId: overrides['shortId'] ?? 'TSK-0001',
    title: overrides['title'] ?? 'Integration test task',
    description: overrides['description'] ?? '{"taskContext":"ctx","additionalContext":"add","requirements":["r1"]}',
    assignee: overrides['assignee'] ?? 'Mark Johnson',
    estimatedTime: overrides['estimatedTime'] ?? '01:00',
    scrumStage: overrides['scrumStage'] ?? 'Backlog',
    transcriptId: overrides['transcriptId'] ?? 'transcript-uuid-001',
    asanaProjectId: 'asanaProjectId' in overrides ? overrides['asanaProjectId'] : 'project-gid-1',
    asanaTaskId: 'asanaTaskId' in overrides ? overrides['asanaTaskId'] : 'task-gid-a',
    asanaWorkspaceId: 'asanaWorkspaceId' in overrides ? overrides['asanaWorkspaceId'] : 'ws-gid-001',
    pushedAt: overrides['pushedAt'] ?? new Date('2026-02-20T10:00:00Z'),
  };
}

function makeAsanaApiTask(
  gid: string,
  completed: boolean,
  completedAt: string | null = null,
  assigneeName: string | null = null,
) {
  return {
    gid,
    name: `Asana task ${gid}`,
    completed,
    completed_at: completedAt,
    assignee: assigneeName ? { gid: `assignee-${gid}`, name: assigneeName } : null,
    custom_fields: [
      { gid: 'cf-1', name: 'Priority', display_value: 'High' },
    ],
  };
}

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

/**
 * Build a mock Drizzle db client that returns pushed task rows on the
 * first select() call and workspace access tokens on subsequent calls.
 */
function buildMockDb(
  pushedRows: Record<string, unknown>[],
  workspaceAccessToken: string | null = ACCESS_TOKEN,
) {
  let selectCallCount = 0;

  return {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++;
      const currentCall = selectCallCount;

      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(),
      };

      if (currentCall === 1) {
        // queryPushedTasks
        chain.where.mockResolvedValue(pushedRows);
      } else {
        // resolveAccessTokenForWorkspace
        if (workspaceAccessToken) {
          chain.limit.mockResolvedValue([{ accessTokenRef: workspaceAccessToken }]);
        } else {
          chain.limit.mockResolvedValue([]);
        }
      }

      return chain;
    }),
  };
}

function buildMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Setup/teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reconcile integration tests', () => {
  // -------------------------------------------------------------------------
  // Happy path — single page
  // -------------------------------------------------------------------------

  describe('single page success', () => {
    it('fetches tasks from Asana and reconciles all matched', async () => {
      const task = makePushedTaskRow({ asanaTaskId: 'task-gid-a' });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/tasks?')) {
          return mockResponse(200, {
            data: [
              makeAsanaApiTask('task-gid-a', true, '2026-02-28T14:30:00.000Z', 'Alice'),
            ],
            next_page: null,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(1);
      expect(result[0]!.asanaStatus).toBe('completed');
      expect(result[0]!.asanaCompleted).toBe(true);
      expect(result[0]!.asanaCompletedAt).toBe('2026-02-28T14:30:00.000Z');
      expect(result[0]!.asanaAssigneeName).toBe('Alice');
    });
  });

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe('pagination', () => {
    it('follows next_page offset to retrieve tasks across 2 pages', async () => {
      const task = makePushedTaskRow({ asanaTaskId: 'task-gid-101' });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      let fetchCallCount = 0;
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/tasks?')) {
          fetchCallCount++;
          if (fetchCallCount === 1) {
            // First page — 100 tasks, none matching ours
            const page1Tasks = Array.from({ length: 100 }, (_, i) =>
              makeAsanaApiTask(`other-gid-${i}`, false),
            );
            return mockResponse(200, {
              data: page1Tasks,
              next_page: { offset: 'page2offset', path: '/tasks?offset=page2offset', uri: 'https://app.asana.com/api/1.0/tasks?offset=page2offset' },
            });
          }
          // Second page — includes our target task
          return mockResponse(200, {
            data: [
              makeAsanaApiTask('task-gid-101', true, '2026-03-01T12:00:00.000Z'),
            ],
            next_page: null,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(fetchCallCount).toBe(2);
      expect(result).toHaveLength(1);
      expect(result[0]!.asanaStatus).toBe('completed');
      expect(result[0]!.asanaCompletedAt).toBe('2026-03-01T12:00:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // 401 auth failure
  // -------------------------------------------------------------------------

  describe('401 auth failure', () => {
    it('throws ReconciliationError with code ASANA_AUTH_FAILED', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      vi.stubGlobal('fetch', vi.fn(async () =>
        mockResponse(401, { errors: [{ message: 'Not Authorized' }] }),
      ));

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reconcileTasksForClient(CLIENT_ID, db as any, log),
      ).rejects.toMatchObject({
        name: 'ReconciliationError',
        code: 'ASANA_AUTH_FAILED',
      });
    });
  });

  // -------------------------------------------------------------------------
  // 403 auth failure
  // -------------------------------------------------------------------------

  describe('403 forbidden', () => {
    it('throws ReconciliationError with code ASANA_AUTH_FAILED', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      vi.stubGlobal('fetch', vi.fn(async () =>
        mockResponse(403, {}),
      ));

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reconcileTasksForClient(CLIENT_ID, db as any, log),
      ).rejects.toMatchObject({
        name: 'ReconciliationError',
        code: 'ASANA_AUTH_FAILED',
      });
    });
  });

  // -------------------------------------------------------------------------
  // 404 project not found — partial continue
  // -------------------------------------------------------------------------

  describe('404 partial continue', () => {
    it('marks tasks for 404 project as not_found and continues with others', async () => {
      const task1 = makePushedTaskRow({
        id: 'uuid-1', asanaTaskId: 'task-gid-a', asanaProjectId: 'project-gid-1',
      });
      const task2 = makePushedTaskRow({
        id: 'uuid-2', asanaTaskId: 'task-gid-b', asanaProjectId: 'project-gid-2',
      });

      let selectCallCount = 0;
      const db = {
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const chain = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn(),
          };
          if (selectCallCount === 1) {
            chain.where.mockResolvedValue([task1, task2]);
          } else {
            chain.limit.mockResolvedValue([{ accessTokenRef: ACCESS_TOKEN }]);
          }
          return chain;
        }),
      };
      const log = buildMockLogger();

      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('project=project-gid-1')) {
          return mockResponse(404, {});
        }
        if (typeof url === 'string' && url.includes('project=project-gid-2')) {
          return mockResponse(200, {
            data: [makeAsanaApiTask('task-gid-b', true, '2026-03-01T12:00:00.000Z')],
            next_page: null,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(2);
      expect(result.find((t) => t.id === 'uuid-1')!.asanaStatus).toBe('not_found');
      expect(result.find((t) => t.id === 'uuid-2')!.asanaStatus).toBe('completed');
    });
  });

  // -------------------------------------------------------------------------
  // 429 retry success
  // -------------------------------------------------------------------------

  describe('429 retry', () => {
    it('succeeds after 429 then 200 on retry', async () => {
      const task = makePushedTaskRow({ asanaTaskId: 'task-gid-a' });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      let fetchCallCount = 0;
      vi.stubGlobal('fetch', vi.fn(async () => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return mockResponse(429, {}, { 'Retry-After': '0' });
        }
        return mockResponse(200, {
          data: [makeAsanaApiTask('task-gid-a', false)],
          next_page: null,
        });
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(1);
      expect(result[0]!.asanaStatus).toBe('incomplete');
      expect(fetchCallCount).toBe(2);
    });

    it('throws ASANA_UNAVAILABLE when 429 exhausts all retries', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      vi.stubGlobal('fetch', vi.fn(async () =>
        mockResponse(429, {}, { 'Retry-After': '0' }),
      ));

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reconcileTasksForClient(CLIENT_ID, db as any, log),
      ).rejects.toMatchObject({
        name: 'ReconciliationError',
        code: 'ASANA_UNAVAILABLE',
      });
    });
  });

  // -------------------------------------------------------------------------
  // 503 retry
  // -------------------------------------------------------------------------

  describe('503 retry', () => {
    it('succeeds after 503 then 200 on retry', async () => {
      const task = makePushedTaskRow({ asanaTaskId: 'task-gid-a' });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      let fetchCallCount = 0;
      vi.stubGlobal('fetch', vi.fn(async () => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return mockResponse(503, {});
        }
        return mockResponse(200, {
          data: [makeAsanaApiTask('task-gid-a', true, '2026-03-01T09:00:00.000Z')],
          next_page: null,
        });
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(1);
      expect(result[0]!.asanaStatus).toBe('completed');
      expect(fetchCallCount).toBe(2);
    });

    it('throws after 503 on all 3 attempts', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      let fetchCallCount = 0;
      vi.stubGlobal('fetch', vi.fn(async () => {
        fetchCallCount++;
        return mockResponse(503, {});
      }));

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reconcileTasksForClient(CLIENT_ID, db as any, log),
      ).rejects.toMatchObject({
        name: 'ReconciliationError',
        code: 'ASANA_UNAVAILABLE',
      });

      // 3 total attempts: initial + 2 retries
      expect(fetchCallCount).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Timeout
  // -------------------------------------------------------------------------

  describe('timeout', () => {
    it('throws ASANA_TIMEOUT when requests exceed timeout budget', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      vi.stubGlobal('fetch', vi.fn(async (_url: string, _opts: RequestInit) => {
        // Simulate AbortController timeout
        const error = new DOMException('The operation was aborted', 'AbortError');
        throw error;
      }));

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reconcileTasksForClient(CLIENT_ID, db as any, log),
      ).rejects.toMatchObject({
        name: 'ReconciliationError',
        code: 'ASANA_TIMEOUT',
      });
    }, 15_000);
  });

  // -------------------------------------------------------------------------
  // Multi-project with one 404
  // -------------------------------------------------------------------------

  describe('multi-project with partial 404', () => {
    it('reconciles successfully for working project while marking 404 project tasks as not_found', async () => {
      const task1 = makePushedTaskRow({
        id: 'uuid-1', asanaTaskId: 'task-gid-a', asanaProjectId: 'project-gid-1',
      });
      const task2 = makePushedTaskRow({
        id: 'uuid-2', asanaTaskId: 'task-gid-b', asanaProjectId: 'project-gid-1',
      });
      const task3 = makePushedTaskRow({
        id: 'uuid-3', asanaTaskId: 'task-gid-c', asanaProjectId: 'project-gid-2',
      });

      let selectCallCount = 0;
      const db = {
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const chain = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn(),
          };
          if (selectCallCount === 1) {
            chain.where.mockResolvedValue([task1, task2, task3]);
          } else {
            chain.limit.mockResolvedValue([{ accessTokenRef: ACCESS_TOKEN }]);
          }
          return chain;
        }),
      };
      const log = buildMockLogger();

      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('project=project-gid-1')) {
          return mockResponse(404, {});
        }
        if (typeof url === 'string' && url.includes('project=project-gid-2')) {
          return mockResponse(200, {
            data: [makeAsanaApiTask('task-gid-c', false)],
            next_page: null,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(3);

      // 404 project tasks should be not_found
      expect(result.find((t) => t.id === 'uuid-1')!.asanaStatus).toBe('not_found');
      expect(result.find((t) => t.id === 'uuid-2')!.asanaStatus).toBe('not_found');

      // Working project tasks should be matched
      expect(result.find((t) => t.id === 'uuid-3')!.asanaStatus).toBe('incomplete');
    });
  });

  // -------------------------------------------------------------------------
  // No real network calls
  // -------------------------------------------------------------------------

  describe('no real network calls', () => {
    it('all fetch calls go through the mock', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      const fetchMock = vi.fn(async () =>
        mockResponse(200, {
          data: [makeAsanaApiTask('task-gid-a', true)],
          next_page: null,
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await reconcileTasksForClient(CLIENT_ID, db as any, log);

      // Verify fetch was called (not bypassed)
      expect(fetchMock).toHaveBeenCalled();

      // Verify the URL points to Asana API
      const calledUrl = fetchMock.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('app.asana.com/api/1.0/tasks');
    });
  });
});
