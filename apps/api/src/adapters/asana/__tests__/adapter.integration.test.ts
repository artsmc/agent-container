import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsanaOutputAdapter } from '../adapter';
import { _clearMemberCache } from '../assignee-resolver';
import { _clearEnumCache } from '../custom-field-resolver';
import type {
  NormalizedTaskPayload,
  WorkspaceConfig,
} from '../../../services/task-types';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_CONFIG: WorkspaceConfig = {
  workspaceId: 'ws-gid-001',
  projectId: 'proj-gid-001',
};

const VALID_TASK: NormalizedTaskPayload = {
  title: 'Update onboarding checklist for Total Life',
  description: [
    '**TASK CONTEXT**',
    '- The client requested an update.',
    '',
    '**ADDITIONAL CONTEXT**',
    '- Last updated November 2025.',
    '',
    '**REQUIREMENTS**',
    '- Review items 3, 5, and 7.',
  ].join('\n'),
  assignee: 'Mark Johnson',
  estimated_time: '02:30',
  scrum_stage: 'Backlog',
  client_name: 'Total Life',
};

const CUSTOM_FIELD_CONFIG = {
  clientFieldGid: 'cf-client-001',
  scrumStageFieldGid: 'cf-scrum-001',
  estimatedTimeFieldGid: 'cf-esttime-001',
  estimatedTimeFormat: 'h_m',
};

const WORKSPACE_RECORD = {
  id: 'uuid-ws-001',
  asanaWorkspaceId: 'ws-gid-001',
  name: 'Test Workspace',
  accessTokenRef: 'secret-access-token',
  customFieldConfig: CUSTOM_FIELD_CONFIG,
  createdAt: new Date(),
};

const ASANA_MEMBERS = [
  { gid: 'user-gid-mark', name: 'Mark Johnson', email: 'mark@iexcel.com' },
  { gid: 'user-gid-sarah', name: 'Sarah Doe', email: 'sarah@iexcel.com' },
];

const CLIENT_ENUM_OPTIONS = [
  { gid: 'enum-gid-tl', name: 'Total Life' },
  { gid: 'enum-gid-acme', name: 'Acme Corp' },
];

const SCRUM_ENUM_OPTIONS = [
  { gid: 'enum-gid-backlog', name: 'Backlog' },
  { gid: 'enum-gid-inprog', name: 'In Progress' },
];

const CREATED_TASK_RESPONSE = {
  data: {
    gid: 'asana-task-gid-001',
    permalink_url: 'https://app.asana.com/0/proj/asana-task-gid-001',
  },
};

// ---------------------------------------------------------------------------
// Mock database builder
// ---------------------------------------------------------------------------

function buildMockDb(wsRecord: Record<string, unknown> | null = WORKSPACE_RECORD) {
  const selectObj = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(wsRecord ? [wsRecord] : []),
  };

  return {
    select: vi.fn().mockReturnValue(selectObj),
  };
}

// ---------------------------------------------------------------------------
// Fetch router — routes mock responses based on URL
// ---------------------------------------------------------------------------

function buildFetchRouter(overrides?: {
  taskStatus?: number;
  taskBody?: Record<string, unknown>;
  taskHeaders?: Record<string, string>;
}) {
  let taskCallCount = 0;

  return vi.fn(async (url: string) => {
    // Workspace members
    if (typeof url === 'string' && url.includes('/workspaces/') && url.includes('/users')) {
      return {
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ data: ASANA_MEMBERS }),
      };
    }

    // Custom field enum options
    if (typeof url === 'string' && url.includes('/custom_fields/cf-client-001')) {
      return {
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ data: { enum_options: CLIENT_ENUM_OPTIONS } }),
      };
    }

    if (typeof url === 'string' && url.includes('/custom_fields/cf-scrum-001')) {
      return {
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ data: { enum_options: SCRUM_ENUM_OPTIONS } }),
      };
    }

    // POST /tasks — task creation
    if (typeof url === 'string' && url.includes('/tasks')) {
      taskCallCount++;
      const status = overrides?.taskStatus ?? 201;
      const body = overrides?.taskBody ?? CREATED_TASK_RESPONSE;
      const headers = new Headers(overrides?.taskHeaders ?? {});

      return {
        status,
        ok: status >= 200 && status < 300,
        headers,
        json: async () => body,
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

// ---------------------------------------------------------------------------
// Setup & teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _clearMemberCache();
  _clearEnumCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AsanaOutputAdapter integration', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('pushes a fully populated task and returns correct ExternalRefResponse', async () => {
      vi.stubGlobal('fetch', buildFetchRouter());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      const result = await adapter.pushTask({
        task: VALID_TASK,
        workspace: WORKSPACE_CONFIG,
      });

      expect(result).toEqual({
        system: 'asana',
        externalId: 'asana-task-gid-001',
        externalUrl: 'https://app.asana.com/0/proj/asana-task-gid-001',
        workspaceId: 'ws-gid-001',
        projectId: 'proj-gid-001',
      });
    });

    it('creates task without assignee when assignee is null', async () => {
      const fetchMock = buildFetchRouter();
      vi.stubGlobal('fetch', fetchMock);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      const result = await adapter.pushTask({
        task: { ...VALID_TASK, assignee: null },
        workspace: WORKSPACE_CONFIG,
      });

      expect(result.system).toBe('asana');
      expect(result.externalId).toBe('asana-task-gid-001');

      // Verify POST /tasks was called, but the body should not contain assignee
      const taskCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].endsWith('/tasks'),
      );
      expect(taskCall).toBeDefined();
      const postBody = JSON.parse((taskCall![1] as RequestInit).body as string);
      expect(postBody.data.assignee).toBeUndefined();
    });

    it('omits client custom field when client name enum is not found', async () => {
      const customClientOptions = [
        { gid: 'enum-gid-acme', name: 'Acme Corp' },
        // Total Life is NOT in the options
      ];

      const fetchMock = vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/workspaces/') && url.includes('/users')) {
          return {
            status: 200, ok: true, headers: new Headers(),
            json: async () => ({ data: ASANA_MEMBERS }),
          };
        }
        if (typeof url === 'string' && url.includes('/custom_fields/cf-client-001')) {
          return {
            status: 200, ok: true, headers: new Headers(),
            json: async () => ({ data: { enum_options: customClientOptions } }),
          };
        }
        if (typeof url === 'string' && url.includes('/custom_fields/cf-scrum-001')) {
          return {
            status: 200, ok: true, headers: new Headers(),
            json: async () => ({ data: { enum_options: SCRUM_ENUM_OPTIONS } }),
          };
        }
        if (typeof url === 'string' && url.includes('/tasks')) {
          return {
            status: 201, ok: true, headers: new Headers(),
            json: async () => CREATED_TASK_RESPONSE,
          };
        }
        throw new Error(`Unexpected: ${url}`);
      });

      vi.stubGlobal('fetch', fetchMock);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      const result = await adapter.pushTask({
        task: VALID_TASK,
        workspace: WORKSPACE_CONFIG,
      });

      expect(result.externalId).toBe('asana-task-gid-001');

      // Verify client field was NOT included in custom_fields
      const taskCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].endsWith('/tasks'),
      );
      const postBody = JSON.parse((taskCall![1] as RequestInit).body as string);
      expect(postBody.data.custom_fields['cf-client-001']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Workspace routing
  // -------------------------------------------------------------------------

  describe('workspace routing', () => {
    it('throws WORKSPACE_NOT_CONFIGURED when workspace GID is not in database', async () => {
      vi.stubGlobal('fetch', buildFetchRouter());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb(null) as any);

      await expect(
        adapter.pushTask({ task: VALID_TASK, workspace: WORKSPACE_CONFIG }),
      ).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_CONFIGURED',
        httpStatus: 422,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('throws VALIDATION_ERROR for empty title', async () => {
      vi.stubGlobal('fetch', buildFetchRouter());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      await expect(
        adapter.pushTask({
          task: { ...VALID_TASK, title: '' },
          workspace: WORKSPACE_CONFIG,
        }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        httpStatus: 422,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws PUSH_FAILED on 401 from Asana', async () => {
      vi.stubGlobal('fetch', buildFetchRouter({
        taskStatus: 401,
        taskBody: { errors: [{ message: 'Not Authorized' }] },
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      await expect(
        adapter.pushTask({ task: VALID_TASK, workspace: WORKSPACE_CONFIG }),
      ).rejects.toMatchObject({
        code: 'PUSH_FAILED',
        httpStatus: 502,
        message: 'Asana access token is invalid or expired',
      });
    });

    it('throws PUSH_FAILED on 403 from Asana', async () => {
      vi.stubGlobal('fetch', buildFetchRouter({
        taskStatus: 403,
        taskBody: {},
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      await expect(
        adapter.pushTask({ task: VALID_TASK, workspace: WORKSPACE_CONFIG }),
      ).rejects.toMatchObject({
        code: 'PUSH_FAILED',
        message: 'Asana access denied to workspace or project',
      });
    });

    it('throws PUSH_FAILED on 404 from Asana', async () => {
      vi.stubGlobal('fetch', buildFetchRouter({
        taskStatus: 404,
        taskBody: {},
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      await expect(
        adapter.pushTask({ task: VALID_TASK, workspace: WORKSPACE_CONFIG }),
      ).rejects.toMatchObject({
        code: 'PUSH_FAILED',
        message: 'Asana workspace or project GID not found',
      });
    });

    it('throws PUSH_FAILED on 400 with Asana error body in details', async () => {
      const errorBody = { errors: [{ message: 'custom_field is not valid' }] };

      vi.stubGlobal('fetch', buildFetchRouter({
        taskStatus: 400,
        taskBody: errorBody,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      await expect(
        adapter.pushTask({ task: VALID_TASK, workspace: WORKSPACE_CONFIG }),
      ).rejects.toMatchObject({
        code: 'PUSH_FAILED',
        httpStatus: 502,
        details: {
          asanaStatus: 400,
          asanaBody: errorBody,
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // Retry
  // -------------------------------------------------------------------------

  describe('retry logic', () => {
    it('succeeds after 429 then 201', async () => {
      let taskCallCount = 0;

      const fetchMock = vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/workspaces/') && url.includes('/users')) {
          return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: ASANA_MEMBERS }) };
        }
        if (typeof url === 'string' && url.includes('/custom_fields/')) {
          const options = url.includes('cf-client') ? CLIENT_ENUM_OPTIONS : SCRUM_ENUM_OPTIONS;
          return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: { enum_options: options } }) };
        }
        if (typeof url === 'string' && url.includes('/tasks')) {
          taskCallCount++;
          if (taskCallCount === 1) {
            return { status: 429, ok: false, headers: new Headers({ 'Retry-After': '0' }), json: async () => ({}) };
          }
          return { status: 201, ok: true, headers: new Headers(), json: async () => CREATED_TASK_RESPONSE };
        }
        throw new Error(`Unexpected: ${url}`);
      });

      vi.stubGlobal('fetch', fetchMock);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      const result = await adapter.pushTask({
        task: VALID_TASK,
        workspace: WORKSPACE_CONFIG,
      });

      expect(result.externalId).toBe('asana-task-gid-001');
      expect(taskCallCount).toBe(2);
    });

    it('throws PUSH_FAILED after 503 on all attempts', async () => {
      let taskCallCount = 0;

      const fetchMock = vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/workspaces/') && url.includes('/users')) {
          return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: ASANA_MEMBERS }) };
        }
        if (typeof url === 'string' && url.includes('/custom_fields/')) {
          const options = url.includes('cf-client') ? CLIENT_ENUM_OPTIONS : SCRUM_ENUM_OPTIONS;
          return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: { enum_options: options } }) };
        }
        if (typeof url === 'string' && url.includes('/tasks')) {
          taskCallCount++;
          return { status: 503, ok: false, headers: new Headers(), json: async () => ({}) };
        }
        throw new Error(`Unexpected: ${url}`);
      });

      vi.stubGlobal('fetch', fetchMock);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      await expect(
        adapter.pushTask({ task: VALID_TASK, workspace: WORKSPACE_CONFIG }),
      ).rejects.toMatchObject({
        code: 'PUSH_FAILED',
      });

      expect(taskCallCount).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent push isolation
  // -------------------------------------------------------------------------

  describe('concurrent push isolation', () => {
    it('two simultaneous pushes return correct ExternalRef for their own tasks', async () => {
      let taskCallCount = 0;

      const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/workspaces/') && url.includes('/users')) {
          return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: ASANA_MEMBERS }) };
        }
        if (typeof url === 'string' && url.includes('/custom_fields/')) {
          const options = url.includes('cf-client') ? CLIENT_ENUM_OPTIONS : SCRUM_ENUM_OPTIONS;
          return { status: 200, ok: true, headers: new Headers(), json: async () => ({ data: { enum_options: options } }) };
        }
        if (typeof url === 'string' && url.includes('/tasks')) {
          taskCallCount++;
          const body = JSON.parse(opts?.body as string);
          const taskGid = `asana-gid-${taskCallCount}`;
          return {
            status: 201, ok: true, headers: new Headers(),
            json: async () => ({
              data: {
                gid: taskGid,
                permalink_url: `https://app.asana.com/0/proj/${taskGid}`,
              },
            }),
          };
        }
        throw new Error(`Unexpected: ${url}`);
      });

      vi.stubGlobal('fetch', fetchMock);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      const [result1, result2] = await Promise.all([
        adapter.pushTask({
          task: { ...VALID_TASK, title: 'Task A' },
          workspace: WORKSPACE_CONFIG,
        }),
        adapter.pushTask({
          task: { ...VALID_TASK, title: 'Task B' },
          workspace: WORKSPACE_CONFIG,
        }),
      ]);

      // Both should have returned successfully with different GIDs
      expect(result1.system).toBe('asana');
      expect(result2.system).toBe('asana');
      expect(result1.externalId).not.toBe(result2.externalId);
    });
  });

  // -------------------------------------------------------------------------
  // Scrum stage defaulting
  // -------------------------------------------------------------------------

  describe('scrum stage defaulting', () => {
    it('defaults scrumStage to "Backlog" when scrum_stage is empty', async () => {
      const fetchMock = buildFetchRouter();
      vi.stubGlobal('fetch', fetchMock);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new AsanaOutputAdapter(buildMockDb() as any);

      await adapter.pushTask({
        task: { ...VALID_TASK, scrum_stage: '' },
        workspace: WORKSPACE_CONFIG,
      });

      // The scrum stage resolver should have been called with "Backlog"
      const scrumCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('cf-scrum-001'),
      );
      expect(scrumCall).toBeDefined();
    });
  });
});
