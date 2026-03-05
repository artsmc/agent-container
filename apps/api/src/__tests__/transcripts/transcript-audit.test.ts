import { describe, it, expect } from 'vitest';
import type { NormalizedTranscript } from '@iexcel/shared-types';
import { MeetingType } from '@iexcel/shared-types';
import { buildTranscriptAuditMetadata } from '../../services/transcript-types';

describe('buildTranscriptAuditMetadata', () => {
  const mockNormalized: NormalizedTranscript = {
    source: 'manual',
    sourceId: 'manual-abc-2026-03-03',
    meetingDate: '2026-03-03T14:00:00Z',
    clientId: 'a1b2c3d4-0000-0000-0000-000000000001',
    meetingType: MeetingType.ClientCall,
    participants: ['Mark', 'Sarah'],
    durationSeconds: 3540,
    segments: [
      { speaker: 'Mark', timestamp: 0, text: 'Hello, lets get started.' },
      { speaker: 'Sarah', timestamp: 12, text: 'Sounds good, I have a few updates...' },
      { speaker: 'Mark', timestamp: 45, text: 'Great, go ahead.' },
      { speaker: 'Sarah', timestamp: 60, text: 'First, about the billing issue.' },
      { speaker: 'Mark', timestamp: 90, text: 'I see, lets resolve that.' },
    ],
    summary: null,
    highlights: null,
  };

  it('correctly counts participants', () => {
    const metadata = buildTranscriptAuditMetadata(
      'client_call',
      '2026-03-03T14:00:00Z',
      mockNormalized,
      5000,
      'json'
    );
    expect(metadata.participant_count).toBe(2);
  });

  it('correctly counts segments', () => {
    const metadata = buildTranscriptAuditMetadata(
      'client_call',
      '2026-03-03T14:00:00Z',
      mockNormalized,
      5000,
      'json'
    );
    expect(metadata.segment_count).toBe(5);
  });

  it('includes raw_transcript_length', () => {
    const metadata = buildTranscriptAuditMetadata(
      'client_call',
      '2026-03-03T14:00:00Z',
      mockNormalized,
      5000,
      'json'
    );
    expect(metadata.raw_transcript_length).toBe(5000);
  });

  it('includes submission_method', () => {
    const metadata = buildTranscriptAuditMetadata(
      'client_call',
      '2026-03-03T14:00:00Z',
      mockNormalized,
      5000,
      'file_upload'
    );
    expect(metadata.submission_method).toBe('file_upload');
  });

  it('does NOT include raw transcript text in metadata', () => {
    const metadata = buildTranscriptAuditMetadata(
      'client_call',
      '2026-03-03T14:00:00Z',
      mockNormalized,
      5000,
      'json'
    );

    // Verify that no value in the metadata object contains transcript text
    const metadataValues = Object.values(metadata);
    for (const value of metadataValues) {
      if (typeof value === 'string') {
        expect(value).not.toContain('Hello');
        expect(value).not.toContain('Sounds good');
      }
    }

    // Verify the metadata shape has no raw_transcript field
    expect('raw_transcript' in metadata).toBe(false);
  });

  it('includes call_type and call_date', () => {
    const metadata = buildTranscriptAuditMetadata(
      'intake',
      '2026-03-03T09:00:00Z',
      mockNormalized,
      3000,
      'json'
    );
    expect(metadata.call_type).toBe('intake');
    expect(metadata.call_date).toBe('2026-03-03T09:00:00Z');
  });
});
