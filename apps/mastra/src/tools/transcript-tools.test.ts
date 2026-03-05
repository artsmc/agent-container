import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the api-client module
vi.mock('../api-client.js', () => ({
  getApiClient: vi.fn(),
}));

import { getApiClient } from '../api-client.js';
import { getTranscript } from './transcript-tools.js';

const mockApiClient = {
  getTranscript: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getApiClient).mockReturnValue(mockApiClient as any);
  vi.clearAllMocks();
});

describe('getTranscript', () => {
  it('has the correct id', () => {
    expect(getTranscript.id).toBe('get-transcript');
  });

  it('calls getTranscript and returns transcript shape on success', async () => {
    const mockResponse = {
      id: 'transcript-uuid-001',
      source: 'grain',
      sourceId: 'grain-rec-123',
      meetingDate: '2026-02-15T14:00:00Z',
      clientId: 'client-uuid-001',
      meetingType: 'intake',
      participants: ['Sarah', 'Mark'],
      durationSeconds: 5220,
      segments: [
        { speaker: 'Sarah', timestamp: 0, text: 'Hello.' },
      ],
      summary: 'Test summary',
      highlights: ['Highlight 1'],
      createdAt: '2026-02-15T14:00:00Z',
      updatedAt: '2026-02-15T14:00:00Z',
    };
    mockApiClient.getTranscript.mockResolvedValue(mockResponse);

    const result = await getTranscript.execute!(
      { transcriptId: 'transcript-uuid-001' },
      {} as any
    );

    expect(result.transcript).toBeDefined();
    expect(mockApiClient.getTranscript).toHaveBeenCalledWith(
      'transcript-uuid-001'
    );
  });

  it('propagates API errors', async () => {
    mockApiClient.getTranscript.mockRejectedValue(
      new Error('API 404: Transcript not found')
    );

    await expect(
      getTranscript.execute!(
        { transcriptId: 'nonexistent' },
        {} as any
      )
    ).rejects.toThrow('API 404: Transcript not found');
  });
});
