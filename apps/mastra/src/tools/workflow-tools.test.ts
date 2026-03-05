import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the api-client module
vi.mock('../api-client.js', () => ({
  getApiClient: vi.fn(),
}));

import { getApiClient } from '../api-client.js';
import { updateWorkflowStatusTool } from './workflow-tools.js';

const mockApiClient = {
  updateWorkflowStatus: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getApiClient).mockReturnValue(mockApiClient as any);
  vi.clearAllMocks();
});

describe('updateWorkflowStatusTool', () => {
  it('has the correct id', () => {
    expect(updateWorkflowStatusTool.id).toBe('update-workflow-status');
  });

  it('updates status to running', async () => {
    mockApiClient.updateWorkflowStatus.mockResolvedValue({});

    const result = await updateWorkflowStatusTool.execute!(
      {
        workflowRunId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'running' as const,
      },
      {} as any
    );

    expect(result).toEqual({ updated: true });
    expect(mockApiClient.updateWorkflowStatus).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      expect.objectContaining({ status: 'running' })
    );
  });

  it('updates status to completed with result', async () => {
    mockApiClient.updateWorkflowStatus.mockResolvedValue({});

    const result = await updateWorkflowStatusTool.execute!(
      {
        workflowRunId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'completed' as const,
        result: {
          task_short_ids: ['TSK-0001', 'TSK-0002'],
          tasks_attempted: 3,
          tasks_created: 2,
          tasks_failed: 1,
        },
      },
      {} as any
    );

    expect(result).toEqual({ updated: true });
  });

  it('updates status to failed with error', async () => {
    mockApiClient.updateWorkflowStatus.mockResolvedValue({});

    const result = await updateWorkflowStatusTool.execute!(
      {
        workflowRunId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'failed' as const,
        error: {
          code: 'LLM_OUTPUT_INVALID',
          message: 'LLM output failed schema validation',
        },
      },
      {} as any
    );

    expect(result).toEqual({ updated: true });
  });

  it('propagates API errors', async () => {
    mockApiClient.updateWorkflowStatus.mockRejectedValue(
      new Error('API 503: Service Unavailable')
    );

    await expect(
      updateWorkflowStatusTool.execute!(
        {
          workflowRunId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'running' as const,
        },
        {} as any
      )
    ).rejects.toThrow('API 503: Service Unavailable');
  });
});
