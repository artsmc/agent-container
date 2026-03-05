import { describe, it, expect, vi } from 'vitest';
import { createApiClient } from '../core/api-client';
import type { ApiClientOptions } from '../types/client-options';

function createTestClient(fetchImpl: typeof fetch): ReturnType<typeof createApiClient> {
  const options: ApiClientOptions = {
    baseUrl: 'https://api.iexcel.test',
    tokenProvider: {
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
      refreshAccessToken: vi.fn().mockResolvedValue('refreshed-token'),
    },
    fetchImpl,
  };
  return createApiClient(options);
}

function mockOkFetch(body: unknown): typeof fetch {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
    })
  );
}

describe('Task Endpoints', () => {
  describe('listTasks', () => {
    it('should call GET /clients/{id}/tasks with status filter', async () => {
      const response = { data: [], total: 0, page: 1, limit: 20, hasMore: false };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      await client.listTasks('client-001', { status: 'draft' as never, page: 1, limit: 20 });

      const url = new URL(
        (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      );
      expect(url.pathname).toBe('/clients/client-001/tasks');
      expect(url.searchParams.get('status')).toBe('draft');
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('limit')).toBe('20');
    });

    it('should call GET /clients/{id}/tasks with transcriptId filter', async () => {
      const response = { data: [], total: 0, page: 1, limit: 20, hasMore: false };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      await client.listTasks('client-001', { transcriptId: 'transcript-abc' });

      const url = new URL(
        (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      );
      expect(url.searchParams.get('transcriptId')).toBe('transcript-abc');
    });
  });

  describe('createTasks', () => {
    it('should call POST /clients/{id}/tasks with single task', async () => {
      const taskBody = {
        clientId: 'c-1',
        title: 'Test Task',
        description: {
          taskContext: 'Context',
          additionalContext: 'Additional',
          requirements: ['req1'],
        },
      };
      const fetchImpl = mockOkFetch([{ id: 'task-1', shortId: 'TSK-001' }]);
      const client = createTestClient(fetchImpl);

      await client.createTasks('c-1', taskBody);

      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(taskBody);
    });

    it('should call POST /clients/{id}/tasks with array of tasks', async () => {
      const tasks = [
        {
          clientId: 'c-1',
          title: 'Task 1',
          description: {
            taskContext: 'Context',
            additionalContext: 'Add',
            requirements: [],
          },
        },
        {
          clientId: 'c-1',
          title: 'Task 2',
          description: {
            taskContext: 'Context',
            additionalContext: 'Add',
            requirements: [],
          },
        },
      ];
      const fetchImpl = mockOkFetch([
        { id: 'task-1', shortId: 'TSK-001' },
        { id: 'task-2', shortId: 'TSK-002' },
      ]);
      const client = createTestClient(fetchImpl);

      const result = await client.createTasks('c-1', tasks);

      expect(result).toHaveLength(2);
      expect(JSON.parse((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string)).toEqual(tasks);
    });
  });

  describe('getTask', () => {
    it('should call GET /tasks/{id} with short ID', async () => {
      const taskData = {
        task: { id: 'task-uuid', shortId: 'TSK-0042' },
        versions: [],
      };
      const fetchImpl = mockOkFetch(taskData);
      const client = createTestClient(fetchImpl);

      const result = await client.getTask('TSK-0042');

      expect(result).toEqual(taskData);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/tasks/TSK-0042');
    });

    it('should call GET /tasks/{id} with UUID', async () => {
      const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
      const fetchImpl = mockOkFetch({
        task: { id: uuid, shortId: 'TSK-0042' },
        versions: [],
      });
      const client = createTestClient(fetchImpl);

      await client.getTask(uuid);

      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe(`https://api.iexcel.test/tasks/${uuid}`);
    });
  });

  describe('updateTask', () => {
    it('should call PATCH /tasks/{id} with body', async () => {
      const fetchImpl = mockOkFetch({ id: 'task-1' });
      const client = createTestClient(fetchImpl);

      await client.updateTask('task-1', { title: 'Updated Title' });

      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body as string)).toEqual({ title: 'Updated Title' });
    });
  });

  describe('approveTask', () => {
    it('should call POST /tasks/{id}/approve', async () => {
      const fetchImpl = mockOkFetch({ id: 'task-1', status: 'approved' });
      const client = createTestClient(fetchImpl);

      await client.approveTask('task-1');

      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/tasks/task-1/approve');
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
    });
  });

  describe('rejectTask', () => {
    it('should call POST /tasks/{id}/reject with body', async () => {
      const fetchImpl = mockOkFetch({ id: 'task-1', status: 'rejected' });
      const client = createTestClient(fetchImpl);

      await client.rejectTask('task-1', { reason: 'Not relevant' });

      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/tasks/task-1/reject');
      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({ reason: 'Not relevant' });
    });

    it('should call POST /tasks/{id}/reject without body', async () => {
      const fetchImpl = mockOkFetch({ id: 'task-1', status: 'rejected' });
      const client = createTestClient(fetchImpl);

      await client.rejectTask('task-1');

      const init = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
    });
  });

  describe('pushTask', () => {
    it('should call POST /tasks/{id}/push', async () => {
      const fetchImpl = mockOkFetch({ id: 'task-1', status: 'pushed' });
      const client = createTestClient(fetchImpl);

      await client.pushTask('task-1');

      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/tasks/task-1/push');
    });
  });

  describe('batchApproveTasks', () => {
    it('should call POST /clients/{id}/tasks/approve with body', async () => {
      const response = {
        succeeded: ['TSK-0001', 'TSK-0002'],
        failed: [
          { id: 'TSK-0003', error: { code: 'FORBIDDEN', message: 'Not allowed' } },
        ],
      };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.batchApproveTasks('client-001', {
        taskIds: ['TSK-0001', 'TSK-0002', 'TSK-0003'],
      });

      expect(result.succeeded).toEqual(['TSK-0001', 'TSK-0002']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('TSK-0003');

      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/clients/client-001/tasks/approve');
    });
  });

  describe('batchPushTasks', () => {
    it('should call POST /clients/{id}/tasks/push with body', async () => {
      const response = { succeeded: ['TSK-0001'], failed: [] };
      const fetchImpl = mockOkFetch(response);
      const client = createTestClient(fetchImpl);

      const result = await client.batchPushTasks('client-001', {
        taskIds: ['TSK-0001'],
      });

      expect(result.succeeded).toEqual(['TSK-0001']);
      const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe('https://api.iexcel.test/clients/client-001/tasks/push');
    });
  });
});
