import { describe, it, expect } from 'vitest';
import { mapGrainRecording } from '../mapper.js';
import { MeetingType } from '@iexcel/shared-types';
import type { GrainRecording } from '../grain-client.js';

function makeRecording(overrides: Partial<GrainRecording> = {}): GrainRecording {
  return {
    id: 'rec-abc123',
    created_at: '2026-02-14T10:00:00Z',
    started_at: '2026-02-14T10:05:00Z',
    duration: 3720000, // ms
    participants: [{ name: 'Mark' }, { name: 'Sarah' }],
    transcript: {
      segments: [
        { speaker: 'Mark', start_time: 0, text: 'Hello everyone.' },
        { speaker: 'Sarah', start_time: 120000, text: 'Hi Mark.' },
        { speaker: 'Mark', start_time: 240000, text: 'Shall we begin?' },
      ],
    },
    ...overrides,
  };
}

const DEFAULT_CALL_TYPE = MeetingType.Intake;
const DEFAULT_CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('mapGrainRecording', () => {
  it('maps all fields correctly for a standard recording', () => {
    const recording = makeRecording();
    const result = mapGrainRecording({
      recording,
      callType: DEFAULT_CALL_TYPE,
      clientId: DEFAULT_CLIENT_ID,
    });

    expect(result.source).toBe('grain');
    expect(result.sourceId).toBe('rec-abc123');
    expect(result.meetingDate).toBe('2026-02-14T10:05:00Z');
    expect(result.clientId).toBe(DEFAULT_CLIENT_ID);
    expect(result.meetingType).toBe(MeetingType.Intake);
    expect(result.participants).toEqual(['Mark', 'Sarah']);
    expect(result.durationSeconds).toBe(3720);
    expect(result.segments).toHaveLength(3);
    expect(result.summary).toBeNull();
    expect(result.highlights).toBeNull();
  });

  it('falls back to created_at when started_at is absent', () => {
    const recording = makeRecording({ started_at: undefined });
    const result = mapGrainRecording({
      recording,
      callType: DEFAULT_CALL_TYPE,
      clientId: DEFAULT_CLIENT_ID,
    });

    expect(result.meetingDate).toBe('2026-02-14T10:00:00Z');
  });

  it('converts duration from ms to seconds', () => {
    const recording = makeRecording({ duration: 7200000 }); // 2 hours in ms
    const result = mapGrainRecording({
      recording,
      callType: DEFAULT_CALL_TYPE,
      clientId: DEFAULT_CLIENT_ID,
    });

    expect(result.durationSeconds).toBe(7200);
  });

  it('passes through duration in seconds when < 100_000', () => {
    const recording = makeRecording({ duration: 3600 }); // 1 hour in seconds
    const result = mapGrainRecording({
      recording,
      callType: DEFAULT_CALL_TYPE,
      clientId: DEFAULT_CLIENT_ID,
    });

    expect(result.durationSeconds).toBe(3600);
  });

  it('calculates duration from segment timestamps when duration is absent', () => {
    const recording = makeRecording({
      duration: undefined,
      transcript: {
        segments: [
          { speaker: 'Mark', start_time: 0, end_time: 60000, text: 'A' },
          { speaker: 'Sarah', start_time: 120000, end_time: 180000, text: 'B' },
        ],
      },
    });

    const result = mapGrainRecording({
      recording,
      callType: DEFAULT_CALL_TYPE,
      clientId: DEFAULT_CLIENT_ID,
    });

    // 180000ms end_time on last segment, 0 start_time on first => 180s
    expect(result.durationSeconds).toBe(180);
  });

  it('returns empty participants when no speakers are present', () => {
    const recording = makeRecording({
      transcript: {
        segments: [],
      },
    });

    const result = mapGrainRecording({
      recording,
      callType: DEFAULT_CALL_TYPE,
      clientId: DEFAULT_CLIENT_ID,
    });

    expect(result.participants).toEqual([]);
    expect(result.segments).toEqual([]);
  });

  it('summary and highlights are always null', () => {
    const recording = makeRecording();
    const result = mapGrainRecording({
      recording,
      callType: DEFAULT_CALL_TYPE,
      clientId: DEFAULT_CLIENT_ID,
    });

    expect(result.summary).toBeNull();
    expect(result.highlights).toBeNull();
  });

  it('maps correct meetingType from callType', () => {
    const recording = makeRecording();
    const result = mapGrainRecording({
      recording,
      callType: MeetingType.FollowUp,
      clientId: DEFAULT_CLIENT_ID,
    });

    expect(result.meetingType).toBe(MeetingType.FollowUp);
  });
});
