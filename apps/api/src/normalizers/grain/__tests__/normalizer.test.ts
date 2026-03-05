import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeGrainTranscript } from '../normalizer.js';
import { GrainNormalizerError } from '../errors.js';
import { GrainApiClient } from '../grain-client.js';
import { ApiErrorCode, MeetingType } from '@iexcel/shared-types';
import type { GrainRecording, GrainRecordingResponse } from '../grain-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeGrainRecording(
  overrides: Partial<GrainRecording> = {}
): GrainRecording {
  return {
    id: 'rec-abc123',
    created_at: '2026-02-14T10:00:00Z',
    started_at: '2026-02-14T10:05:00Z',
    duration: 3720000,
    participants: [{ name: 'Mark' }, { name: 'Sarah' }],
    transcript: {
      segments: [
        { speaker: 'Mark', start_time: 0, text: 'Hello everyone.' },
        { speaker: 'Sarah', start_time: 120000, text: 'Hi Mark, how are you?' },
        { speaker: 'Mark', start_time: 240000, text: 'Great, shall we begin?' },
      ],
    },
    ...overrides,
  };
}

function createMockClient(recording: GrainRecording): GrainApiClient {
  const mockResponse: GrainRecordingResponse = { recording };
  const fetchFn = vi.fn(async () => {
    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return new GrainApiClient({
    apiKey: 'test-key',
    baseUrl: 'https://mock.grain.com/v1',
    fetchFn,
  });
}

function createErrorClient(
  error: GrainNormalizerError
): GrainApiClient {
  const client = {
    fetchRecording: vi.fn().mockRejectedValue(error),
  } as unknown as GrainApiClient;
  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizeGrainTranscript', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Success path ---

  it('returns a complete NormalizedTranscript on success', async () => {
    const recording = makeGrainRecording();
    const client = createMockClient(recording);

    const result = await normalizeGrainTranscript(
      {
        grainRecordingId: 'rec-abc123',
        callType: MeetingType.Intake,
        clientId: VALID_CLIENT_ID,
      },
      { client }
    );

    expect(result.source).toBe('grain');
    expect(result.sourceId).toBe('rec-abc123');
    expect(result.meetingDate).toBe('2026-02-14T10:05:00Z');
    expect(result.clientId).toBe(VALID_CLIENT_ID);
    expect(result.meetingType).toBe(MeetingType.Intake);
    expect(result.participants).toEqual(['Mark', 'Sarah']);
    expect(result.durationSeconds).toBe(3720);
    expect(result.segments).toHaveLength(3);
    expect(result.summary).toBeNull();
    expect(result.highlights).toBeNull();
  });

  it('includes all required NormalizedTranscript fields', async () => {
    const recording = makeGrainRecording();
    const client = createMockClient(recording);

    const result = await normalizeGrainTranscript(
      {
        grainRecordingId: 'rec-abc123',
        callType: MeetingType.ClientCall,
        clientId: VALID_CLIENT_ID,
      },
      { client }
    );

    const keys = Object.keys(result);
    expect(keys).toContain('source');
    expect(keys).toContain('sourceId');
    expect(keys).toContain('meetingDate');
    expect(keys).toContain('clientId');
    expect(keys).toContain('meetingType');
    expect(keys).toContain('participants');
    expect(keys).toContain('durationSeconds');
    expect(keys).toContain('segments');
    expect(keys).toContain('summary');
    expect(keys).toContain('highlights');
  });

  // --- Validation errors ---

  it('throws on empty grainRecordingId', async () => {
    await expect(
      normalizeGrainTranscript({
        grainRecordingId: '',
        callType: MeetingType.Intake,
        clientId: VALID_CLIENT_ID,
      })
    ).rejects.toThrow(GrainNormalizerError);

    try {
      await normalizeGrainTranscript({
        grainRecordingId: '',
        callType: MeetingType.Intake,
        clientId: VALID_CLIENT_ID,
      });
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.message).toBe('grainRecordingId is required');
    }
  });

  it('throws on whitespace-only grainRecordingId', async () => {
    try {
      await normalizeGrainTranscript({
        grainRecordingId: '   ',
        callType: MeetingType.Intake,
        clientId: VALID_CLIENT_ID,
      });
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.message).toBe('grainRecordingId is required');
    }
  });

  it('throws on grainRecordingId with whitespace', async () => {
    try {
      await normalizeGrainTranscript({
        grainRecordingId: 'rec abc 123',
        callType: MeetingType.Intake,
        clientId: VALID_CLIENT_ID,
      });
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.message).toBe('grainRecordingId must not contain whitespace');
    }
  });

  it('throws on grainRecordingId exceeding 500 characters', async () => {
    try {
      await normalizeGrainTranscript({
        grainRecordingId: 'x'.repeat(501),
        callType: MeetingType.Intake,
        clientId: VALID_CLIENT_ID,
      });
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.message).toBe('grainRecordingId is too long');
    }
  });

  it('throws on invalid callType', async () => {
    try {
      await normalizeGrainTranscript({
        grainRecordingId: 'rec-abc123',
        callType: 'board_meeting' as MeetingType,
        clientId: VALID_CLIENT_ID,
      });
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
    }
  });

  it('throws on invalid clientId (not UUID)', async () => {
    try {
      await normalizeGrainTranscript({
        grainRecordingId: 'rec-abc123',
        callType: MeetingType.Intake,
        clientId: 'not-a-uuid',
      });
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.message).toBe('clientId must be a valid UUID');
    }
  });

  // --- Grain API errors ---

  it('throws GRAIN_RECORDING_NOT_FOUND when Grain returns 404', async () => {
    const client = createErrorClient(
      new GrainNormalizerError(
        ApiErrorCode.GrainRecordingNotFound,
        'Grain recording not found',
        404
      )
    );

    try {
      await normalizeGrainTranscript(
        {
          grainRecordingId: 'rec-missing',
          callType: MeetingType.Intake,
          clientId: VALID_CLIENT_ID,
        },
        { client }
      );
      expect.fail('Should have thrown');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainRecordingNotFound);
    }
  });

  it('throws GRAIN_ACCESS_DENIED when Grain returns 401', async () => {
    const client = createErrorClient(
      new GrainNormalizerError(
        ApiErrorCode.GrainAccessDenied,
        'Access denied to Grain API',
        403
      )
    );

    try {
      await normalizeGrainTranscript(
        {
          grainRecordingId: 'rec-abc123',
          callType: MeetingType.Intake,
          clientId: VALID_CLIENT_ID,
        },
        { client }
      );
      expect.fail('Should have thrown');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainAccessDenied);
    }
  });

  it('throws GRAIN_TRANSCRIPT_UNAVAILABLE when transcript is null', async () => {
    const recording = makeGrainRecording({ transcript: null });
    const client = createMockClient(recording);

    try {
      await normalizeGrainTranscript(
        {
          grainRecordingId: 'rec-new',
          callType: MeetingType.Intake,
          clientId: VALID_CLIENT_ID,
        },
        { client }
      );
      expect.fail('Should have thrown');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainTranscriptUnavailable);
      expect(e.httpStatus).toBe(422);
    }
  });

  it('throws GRAIN_TRANSCRIPT_UNAVAILABLE when segments array is empty', async () => {
    const recording = makeGrainRecording({
      transcript: { segments: [] },
    });
    const client = createMockClient(recording);

    try {
      await normalizeGrainTranscript(
        {
          grainRecordingId: 'rec-empty',
          callType: MeetingType.Intake,
          clientId: VALID_CLIENT_ID,
        },
        { client }
      );
      expect.fail('Should have thrown');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainTranscriptUnavailable);
    }
  });

  it('throws GRAIN_API_ERROR for general API failures', async () => {
    const client = createErrorClient(
      new GrainNormalizerError(
        ApiErrorCode.GrainApiError,
        'Grain API server error',
        502
      )
    );

    try {
      await normalizeGrainTranscript(
        {
          grainRecordingId: 'rec-abc123',
          callType: MeetingType.Intake,
          clientId: VALID_CLIENT_ID,
        },
        { client }
      );
      expect.fail('Should have thrown');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainApiError);
      expect(e.httpStatus).toBe(502);
    }
  });

  // --- Missing API key ---

  it('throws GRAIN_API_ERROR when GRAIN_API_KEY is not set', async () => {
    const originalKey = process.env['GRAIN_API_KEY'];
    delete process.env['GRAIN_API_KEY'];

    try {
      await normalizeGrainTranscript({
        grainRecordingId: 'rec-abc123',
        callType: MeetingType.Intake,
        clientId: VALID_CLIENT_ID,
      });
      expect.fail('Should have thrown');
    } catch (err) {
      const e = err as GrainNormalizerError;
      expect(e.code).toBe(ApiErrorCode.GrainApiError);
      expect(e.message).toBe('Grain API key is not configured');
    } finally {
      if (originalKey !== undefined) {
        process.env['GRAIN_API_KEY'] = originalKey;
      }
    }
  });
});
