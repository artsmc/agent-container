import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AsanaTaskItem } from '../asana-client';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockFetchProjectTasks = vi.fn<
  (projectGid: string, accessToken: string) => Promise<AsanaTaskItem[]>
>();

vi.mock('../asana-client', () => ({
  fetchProjectTasks: (...args: [string, string]) => mockFetchProjectTasks(...args),
}));

// Import after mock setup
import { reconcileTasksForClient } from '../reconcile';
import { ReconciliationError, ProjectNotFoundError } from '../reconciliation-error';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const CLIENT_ID = 'client-uuid-001';
const ACCESS_TOKEN = 'xoxp-secret-token';

function makePushedTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides['id'] ?? 'task-uuid-001',
    shortId: overrides['shortId'] ?? 'TSK-0001',
    title: overrides['title'] ?? 'Set up CI pipeline',
    description: overrides['description'] ?? JSON.stringify({
      taskContext: 'Test context',
      additionalContext: 'Extra',
      requirements: ['R1'],
    }),
    assignee: overrides['assignee'] ?? 'Mark Johnson',
    estimatedTime: overrides['estimatedTime'] ?? '02:30',
    scrumStage: overrides['scrumStage'] ?? 'In Progress',
    transcriptId: overrides['transcriptId'] ?? 'transcript-uuid-001',
    asanaProjectId: 'asanaProjectId' in overrides ? overrides['asanaProjectId'] : 'project-gid-1',
    asanaTaskId: 'asanaTaskId' in overrides ? overrides['asanaTaskId'] : 'task-gid-a',
    asanaWorkspaceId: 'asanaWorkspaceId' in overrides ? overrides['asanaWorkspaceId'] : 'ws-gid-001',
    pushedAt: overrides['pushedAt'] ?? new Date('2026-02-20T10:00:00Z'),
  };
}

function makeAsanaTaskItem(
  gid: string,
  completed: boolean,
  completedAt: string | null = null,
  assigneeName: string | null = null,
): AsanaTaskItem {
  return {
    gid,
    name: `Asana task ${gid}`,
    completed,
    completed_at: completedAt,
    assignee: assigneeName ? { gid: `assignee-gid-${gid}`, name: assigneeName } : null,
    custom_fields: [
      { gid: 'cf-gid-1', name: 'Priority', display_value: 'High' },
    ],
  };
}

// Mock workspace resolution via Drizzle
function buildMockDb(
  pushedRows: Record<string, unknown>[] = [],
  workspaceAccessToken: string | null = ACCESS_TOKEN,
) {
  // Build a chainable select mock
  const selectObj = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };

  const db = {
    select: vi.fn().mockReturnValue(selectObj),
  };

  // Track call count to distinguish between queries
  let selectCallCount = 0;

  db.select.mockImplementation(() => {
    selectCallCount++;
    const currentCall = selectCallCount;

    const chainable = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    };

    // First select = queryPushedTasks (returns rows, no .limit())
    // Subsequent selects = resolveAccessTokenForWorkspace (returns token rows, has .limit())
    if (currentCall === 1) {
      // queryPushedTasks returns directly from .where()
      chainable.where.mockResolvedValue(pushedRows);
      chainable.limit.mockResolvedValue(pushedRows);
    } else {
      // resolveAccessTokenForWorkspace
      if (workspaceAccessToken) {
        chainable.limit.mockResolvedValue([{ accessTokenRef: workspaceAccessToken }]);
      } else {
        chainable.limit.mockResolvedValue([]);
      }
    }

    return chainable;
  });

  return db;
}

// Build a mock logger to capture log calls
function buildMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test setup/teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFetchProjectTasks.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reconcileTasksForClient', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('returns all matched tasks when every GID is found in Asana', async () => {
      const task1 = makePushedTaskRow({ id: 'uuid-1', shortId: 'TSK-0001', asanaTaskId: 'task-gid-a' });
      const task2 = makePushedTaskRow({ id: 'uuid-2', shortId: 'TSK-0002', asanaTaskId: 'task-gid-b' });
      const task3 = makePushedTaskRow({ id: 'uuid-3', shortId: 'TSK-0003', asanaTaskId: 'task-gid-c' });

      const db = buildMockDb([task1, task2, task3]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockResolvedValue([
        makeAsanaTaskItem('task-gid-a', true, '2026-02-28T14:30:00.000Z', 'Alice'),
        makeAsanaTaskItem('task-gid-b', false, null, 'Bob'),
        makeAsanaTaskItem('task-gid-c', true, '2026-03-01T09:00:00.000Z'),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(3);

      // Check completed task
      const r1 = result.find((t) => t.id === 'uuid-1')!;
      expect(r1.asanaStatus).toBe('completed');
      expect(r1.asanaCompleted).toBe(true);
      expect(r1.asanaCompletedAt).toBe('2026-02-28T14:30:00.000Z');
      expect(r1.asanaAssigneeName).toBe('Alice');
      expect(r1.asanaCustomFields).toHaveLength(1);
      expect(r1.asanaCustomFields[0]!.name).toBe('Priority');

      // Check incomplete task
      const r2 = result.find((t) => t.id === 'uuid-2')!;
      expect(r2.asanaStatus).toBe('incomplete');
      expect(r2.asanaCompleted).toBe(false);
      expect(r2.asanaCompletedAt).toBeNull();
      expect(r2.asanaAssigneeName).toBe('Bob');

      // Check second completed task with no assignee
      const r3 = result.find((t) => t.id === 'uuid-3')!;
      expect(r3.asanaStatus).toBe('completed');
      expect(r3.asanaAssigneeName).toBeNull();
    });

    it('groups tasks by project and fetches each project once', async () => {
      const task1 = makePushedTaskRow({
        id: 'uuid-1', asanaTaskId: 'task-gid-a', asanaProjectId: 'project-gid-1',
      });
      const task2 = makePushedTaskRow({
        id: 'uuid-2', asanaTaskId: 'task-gid-b', asanaProjectId: 'project-gid-1',
      });
      const task3 = makePushedTaskRow({
        id: 'uuid-3', asanaTaskId: 'task-gid-c', asanaProjectId: 'project-gid-2',
      });
      const task4 = makePushedTaskRow({
        id: 'uuid-4', asanaTaskId: 'task-gid-d', asanaProjectId: 'project-gid-2',
      });

      // Need two workspace lookups (one per project)
      let selectCallCount = 0;
      const selectObj = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(),
      };
      const db = {
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const chain = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn(),
          };
          if (selectCallCount === 1) {
            chain.where.mockResolvedValue([task1, task2, task3, task4]);
          } else {
            chain.limit.mockResolvedValue([{ accessTokenRef: ACCESS_TOKEN }]);
          }
          return chain;
        }),
      };
      const log = buildMockLogger();

      mockFetchProjectTasks
        .mockResolvedValueOnce([
          makeAsanaTaskItem('task-gid-a', true),
          makeAsanaTaskItem('task-gid-b', false),
        ])
        .mockResolvedValueOnce([
          makeAsanaTaskItem('task-gid-c', false),
          makeAsanaTaskItem('task-gid-d', true),
        ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(4);
      expect(mockFetchProjectTasks).toHaveBeenCalledTimes(2);
      expect(mockFetchProjectTasks).toHaveBeenCalledWith('project-gid-1', ACCESS_TOKEN);
      expect(mockFetchProjectTasks).toHaveBeenCalledWith('project-gid-2', ACCESS_TOKEN);
    });

    it('returns completed task with correct asanaCompletedAt timestamp', async () => {
      const task = makePushedTaskRow({ asanaTaskId: 'task-gid-a' });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockResolvedValue([
        makeAsanaTaskItem('task-gid-a', true, '2026-02-28T14:30:00.000Z'),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result[0]!.asanaStatus).toBe('completed');
      expect(result[0]!.asanaCompleted).toBe(true);
      expect(result[0]!.asanaCompletedAt).toBe('2026-02-28T14:30:00.000Z');
    });

    it('returns incomplete task with asanaCompleted false', async () => {
      const task = makePushedTaskRow({ asanaTaskId: 'task-gid-a' });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockResolvedValue([
        makeAsanaTaskItem('task-gid-a', false),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result[0]!.asanaStatus).toBe('incomplete');
      expect(result[0]!.asanaCompleted).toBe(false);
      expect(result[0]!.asanaCompletedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Empty results
  // -------------------------------------------------------------------------

  describe('no pushed tasks', () => {
    it('returns empty array and does not call fetchProjectTasks', async () => {
      const db = buildMockDb([]);
      const log = buildMockLogger();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toEqual([]);
      expect(mockFetchProjectTasks).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Unmatched scenarios
  // -------------------------------------------------------------------------

  describe('unmatched tasks', () => {
    it('marks task with null asanaProjectId as not_found', async () => {
      const task = makePushedTaskRow({ asanaProjectId: null, asanaWorkspaceId: null });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(1);
      expect(result[0]!.asanaStatus).toBe('not_found');
      expect(result[0]!.asanaCompleted).toBeNull();
      expect(result[0]!.asanaCompletedAt).toBeNull();
      expect(result[0]!.asanaAssigneeName).toBeNull();
      expect(result[0]!.asanaCustomFields).toEqual([]);
      expect(mockFetchProjectTasks).not.toHaveBeenCalled();

      // Verify warning logged with correct reason
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'missing_asana_project_id' }),
        'Unmatched task',
      );
    });

    it('marks task with null asanaTaskId as not_found', async () => {
      const task = makePushedTaskRow({ asanaTaskId: null });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      // fetchProjectTasks is still called for the project, but the task itself is unmatched
      mockFetchProjectTasks.mockResolvedValue([
        makeAsanaTaskItem('other-gid', true),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(1);
      expect(result[0]!.asanaStatus).toBe('not_found');
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'missing_asana_task_id' }),
        'Unmatched task',
      );
    });

    it('marks task as not_found when GID is not in project response', async () => {
      const task = makePushedTaskRow({ asanaTaskId: 'task-gid-missing' });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockResolvedValue([
        makeAsanaTaskItem('task-gid-other', true),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(1);
      expect(result[0]!.asanaStatus).toBe('not_found');
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'task_not_in_project',
          asanaTaskId: 'task-gid-missing',
        }),
        'Unmatched task',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Postgres metadata preservation
  // -------------------------------------------------------------------------

  describe('metadata preservation', () => {
    it('preserves all 11 Postgres metadata fields in output', async () => {
      const pushedAt = new Date('2026-02-20T10:00:00Z');
      const task = makePushedTaskRow({
        id: 'task-uuid-042',
        shortId: 'TSK-0042',
        title: 'Setup CI pipeline',
        description: '{"taskContext":"Ctx","additionalContext":"Add","requirements":["R1"]}',
        assignee: 'Mark Johnson',
        estimatedTime: '02:30',
        scrumStage: 'In Progress',
        transcriptId: 'transcript-uuid-042',
        asanaProjectId: 'project-gid-1',
        asanaTaskId: 'task-gid-a',
        pushedAt,
      });
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockResolvedValue([
        makeAsanaTaskItem('task-gid-a', true),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result[0]).toMatchObject({
        id: 'task-uuid-042',
        shortId: 'TSK-0042',
        title: 'Setup CI pipeline',
        assignee: 'Mark Johnson',
        estimatedTime: '02:30',
        scrumStage: 'In Progress',
        transcriptId: 'transcript-uuid-042',
        asanaProjectId: 'project-gid-1',
        asanaTaskId: 'task-gid-a',
        pushedAt,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws ReconciliationError on ASANA_AUTH_FAILED', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockRejectedValue(
        new ReconciliationError('ASANA_AUTH_FAILED', 'Asana returned 401', { status: 401 }),
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reconcileTasksForClient(CLIENT_ID, db as any, log),
      ).rejects.toMatchObject({
        name: 'ReconciliationError',
        code: 'ASANA_AUTH_FAILED',
      });
    });

    it('continues with other projects when one returns 404', async () => {
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

      mockFetchProjectTasks
        .mockRejectedValueOnce(new ProjectNotFoundError('project-gid-1'))
        .mockResolvedValueOnce([makeAsanaTaskItem('task-gid-b', true)]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await reconcileTasksForClient(CLIENT_ID, db as any, log);

      expect(result).toHaveLength(2);
      expect(result.find((t) => t.id === 'uuid-1')!.asanaStatus).toBe('not_found');
      expect(result.find((t) => t.id === 'uuid-2')!.asanaStatus).toBe('completed');

      // Verify 404 warning logged
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ projectGid: 'project-gid-1' }),
        'Asana project not found (404) — tasks will be unmatched',
      );
    });

    it('throws on ASANA_UNAVAILABLE after retries exhausted', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockRejectedValue(
        new ReconciliationError('ASANA_UNAVAILABLE', 'Asana returned 503', { status: 503 }),
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reconcileTasksForClient(CLIENT_ID, db as any, log),
      ).rejects.toMatchObject({
        name: 'ReconciliationError',
        code: 'ASANA_UNAVAILABLE',
      });
    });

    it('throws on ASANA_TIMEOUT', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockRejectedValue(
        new ReconciliationError('ASANA_TIMEOUT', 'Asana API request timed out'),
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reconcileTasksForClient(CLIENT_ID, db as any, log),
      ).rejects.toMatchObject({
        name: 'ReconciliationError',
        code: 'ASANA_TIMEOUT',
      });
    });
  });

  // -------------------------------------------------------------------------
  // No Postgres writes
  // -------------------------------------------------------------------------

  describe('read-only guarantee', () => {
    it('never calls update or insert on the database', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockResolvedValue([
        makeAsanaTaskItem('task-gid-a', true),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockDb = db as any;
      mockDb.update = vi.fn();
      mockDb.insert = vi.fn();

      await reconcileTasksForClient(CLIENT_ID, mockDb, log);

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Logging
  // -------------------------------------------------------------------------

  describe('logging', () => {
    it('emits structured logs for a successful reconciliation', async () => {
      const task = makePushedTaskRow();
      const db = buildMockDb([task]);
      const log = buildMockLogger();

      mockFetchProjectTasks.mockResolvedValue([
        makeAsanaTaskItem('task-gid-a', true),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await reconcileTasksForClient(CLIENT_ID, db as any, log);

      // Info: Reconciliation started
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: CLIENT_ID,
          pushedTaskCount: 1,
          uniqueProjectCount: 1,
        }),
        'Reconciliation started',
      );

      // Debug: Project fetch started
      expect(log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: CLIENT_ID,
          projectGid: 'project-gid-1',
        }),
        'Project fetch started',
      );

      // Debug: Project fetch completed
      expect(log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: CLIENT_ID,
          projectGid: 'project-gid-1',
          totalTasksFetched: 1,
        }),
        'Project fetch completed',
      );

      // Info: Reconciliation completed
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: CLIENT_ID,
          reconciledCount: 1,
          unmatchedCount: 0,
        }),
        'Reconciliation completed',
      );
    });

    it('logs unmatched tasks with correct reason codes', async () => {
      const task1 = makePushedTaskRow({
        id: 'uuid-1', shortId: 'TSK-0001', asanaProjectId: null, asanaWorkspaceId: null,
      });
      const task2 = makePushedTaskRow({
        id: 'uuid-2', shortId: 'TSK-0002', asanaTaskId: null,
      });
      const task3 = makePushedTaskRow({
        id: 'uuid-3', shortId: 'TSK-0003', asanaTaskId: 'task-gid-missing',
      });

      // Need a separate mock db that supports multiple select calls
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

      mockFetchProjectTasks.mockResolvedValue([
        makeAsanaTaskItem('task-gid-other', true),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await reconcileTasksForClient(CLIENT_ID, db as any, log);

      // Check all three warn calls
      const warnCalls = log.warn.mock.calls.filter(
        (call: [Record<string, unknown>, string]) => call[1] === 'Unmatched task',
      );
      const reasons = warnCalls.map(
        (call: [Record<string, unknown>, string]) => (call[0] as Record<string, unknown>)['reason'],
      );

      expect(reasons).toContain('missing_asana_project_id');
      expect(reasons).toContain('missing_asana_task_id');
      expect(reasons).toContain('task_not_in_project');
    });
  });
});
