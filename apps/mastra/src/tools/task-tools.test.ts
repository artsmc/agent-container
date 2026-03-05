import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the api-client module
vi.mock('../api-client.js', () => ({
  getApiClient: vi.fn(),
}));

import { getApiClient } from '../api-client.js';
import { saveTasksTool } from './task-tools.js';

const mockApiClient = {
  createTasks: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getApiClient).mockReturnValue(mockApiClient as any);
  vi.clearAllMocks();
});

// Valid UUIDs for testing
const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TRANSCRIPT_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('saveTasksTool', () => {
  it('has the correct id', () => {
    expect(saveTasksTool.id).toBe('save-tasks');
  });

  it('calls createTasks with correct args on success', async () => {
    const mockTask = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      shortId: 'TSK-0001',
      status: 'draft',
    };
    mockApiClient.createTasks.mockResolvedValue([mockTask]);

    const input = {
      clientId: CLIENT_ID,
      transcriptId: TRANSCRIPT_ID,
      title: 'Update proposal with Q2 pricing',
      description: {
        taskContext: 'During the intake call...',
        additionalContext: 'Q2 pricing changes...',
        requirements: ['Update pricing table', 'Review with team'],
      },
      assignee: 'Mark',
      estimatedTime: 'PT2H',
      scrumStage: 'Backlog',
      tags: ['pricing'],
      priority: 'medium' as const,
    };

    const result = await saveTasksTool.execute!(input, {} as any);
    expect(result).toEqual({
      shortId: 'TSK-0001',
      id: '550e8400-e29b-41d4-a716-446655440002',
      status: 'draft',
    });
    expect(mockApiClient.createTasks).toHaveBeenCalledWith(
      CLIENT_ID,
      expect.objectContaining({
        clientId: CLIENT_ID,
        transcriptId: TRANSCRIPT_ID,
        title: 'Update proposal with Q2 pricing',
      })
    );
  });

  it('propagates API errors', async () => {
    mockApiClient.createTasks.mockRejectedValue(
      new Error('API 500: Internal Server Error')
    );

    const input = {
      clientId: CLIENT_ID,
      transcriptId: TRANSCRIPT_ID,
      title: 'Test task',
      description: {
        taskContext: 'Test context',
        additionalContext: 'Test additional',
        requirements: ['Test req'],
      },
      assignee: null,
      estimatedTime: null,
      scrumStage: 'Backlog',
      tags: [],
      priority: 'medium' as const,
    };

    await expect(saveTasksTool.execute!(input, {} as any)).rejects.toThrow(
      'API 500: Internal Server Error'
    );
  });
});
