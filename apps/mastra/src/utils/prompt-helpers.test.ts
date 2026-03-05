import { describe, it, expect } from 'vitest';
import {
  formatTimestamp,
  formatDuration,
  formatDate,
  convertEstimatedTimeToDuration,
  buildIntakePrompt,
} from './prompt-helpers.js';
import type { NormalizedTranscript } from '@iexcel/shared-types';
import { MeetingType } from '@iexcel/shared-types';

// ── formatTimestamp ─────────────────────────────────────────────────────────

describe('formatTimestamp', () => {
  it('formats 0 seconds as 00:00:00', () => {
    expect(formatTimestamp(0)).toBe('00:00:00');
  });

  it('formats 59 seconds correctly', () => {
    expect(formatTimestamp(59)).toBe('00:00:59');
  });

  it('formats 872 seconds as 00:14:32', () => {
    expect(formatTimestamp(872)).toBe('00:14:32');
  });

  it('formats 3661 seconds as 01:01:01', () => {
    expect(formatTimestamp(3661)).toBe('01:01:01');
  });

  it('formats 86399 seconds (one second before 24h)', () => {
    expect(formatTimestamp(86399)).toBe('23:59:59');
  });
});

// ── formatDuration ──────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats 0 seconds as 0m', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats 60 seconds as 1m', () => {
    expect(formatDuration(60)).toBe('1m');
  });

  it('formats 1800 seconds as 30m', () => {
    expect(formatDuration(1800)).toBe('30m');
  });

  it('formats 3600 seconds as 1h', () => {
    expect(formatDuration(3600)).toBe('1h');
  });

  it('formats 5220 seconds as 1h 27m', () => {
    expect(formatDuration(5220)).toBe('1h 27m');
  });
});

// ── formatDate ──────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats ISO date to human-readable', () => {
    expect(formatDate('2026-02-15T14:00:00Z')).toBe('February 15, 2026');
  });
});

// ── convertEstimatedTimeToDuration ──────────────────────────────────────────

describe('convertEstimatedTimeToDuration', () => {
  it('passes through valid durations', () => {
    expect(convertEstimatedTimeToDuration('PT2H30M')).toBe('PT2H30M');
  });

  it('normalizes zero-hours: PT0H30M -> PT30M', () => {
    expect(convertEstimatedTimeToDuration('PT0H30M')).toBe('PT30M');
  });

  it('normalizes zero-minutes: PT2H0M -> PT2H', () => {
    expect(convertEstimatedTimeToDuration('PT2H0M')).toBe('PT2H');
  });

  it('handles hours-only duration: PT3H -> PT3H', () => {
    expect(convertEstimatedTimeToDuration('PT3H')).toBe('PT3H');
  });

  it('handles minutes-only duration: PT45M -> PT45M', () => {
    expect(convertEstimatedTimeToDuration('PT45M')).toBe('PT45M');
  });

  it('returns null for null input', () => {
    expect(convertEstimatedTimeToDuration(null)).toBeNull();
  });

  it('returns input as-is for malformed strings', () => {
    expect(convertEstimatedTimeToDuration('invalid')).toBe('invalid');
  });

  it('handles PT0H0M edge case', () => {
    expect(convertEstimatedTimeToDuration('PT0H0M')).toBe('PT0M');
  });
});

// ── buildIntakePrompt ───────────────────────────────────────────────────────

describe('buildIntakePrompt', () => {
  const fullTranscript: NormalizedTranscript = {
    source: 'grain',
    sourceId: 'grain-rec-123',
    meetingDate: '2026-02-15T14:00:00Z',
    clientId: 'client-uuid-001',
    meetingType: MeetingType.Intake,
    participants: ['Sarah (iExcel)', 'Mark (iExcel)', 'John (Client)'],
    durationSeconds: 5220,
    segments: [
      { speaker: 'Sarah', timestamp: 0, text: 'Hello everyone.' },
      {
        speaker: 'John',
        timestamp: 15,
        text: 'Thanks for having me.',
      },
      {
        speaker: 'Mark',
        timestamp: 872,
        text: 'Lets discuss the project.',
      },
    ],
    summary:
      'Intake call discussing project requirements and next steps.',
    highlights: [
      'Q2 pricing update needed',
      'Dashboard setup required',
    ],
  };

  it('includes meeting date in human-readable format', () => {
    const prompt = buildIntakePrompt(fullTranscript);
    expect(prompt).toContain('Meeting Date: February 15, 2026');
  });

  it('includes participants comma-separated', () => {
    const prompt = buildIntakePrompt(fullTranscript);
    expect(prompt).toContain(
      'Participants: Sarah (iExcel), Mark (iExcel), John (Client)'
    );
  });

  it('includes duration in Xh Ym format', () => {
    const prompt = buildIntakePrompt(fullTranscript);
    expect(prompt).toContain('Duration: 1h 27m');
  });

  it('includes summary when present', () => {
    const prompt = buildIntakePrompt(fullTranscript);
    expect(prompt).toContain('Summary:');
    expect(prompt).toContain(
      'Intake call discussing project requirements'
    );
  });

  it('includes highlights when present', () => {
    const prompt = buildIntakePrompt(fullTranscript);
    expect(prompt).toContain('Highlights:');
    expect(prompt).toContain('- Q2 pricing update needed');
    expect(prompt).toContain('- Dashboard setup required');
  });

  it('includes segments formatted as [HH:MM:SS] Speaker: text', () => {
    const prompt = buildIntakePrompt(fullTranscript);
    expect(prompt).toContain('[00:00:00] Sarah: Hello everyone.');
    expect(prompt).toContain(
      '[00:00:15] John: Thanks for having me.'
    );
    expect(prompt).toContain(
      '[00:14:32] Mark: Lets discuss the project.'
    );
  });

  it('handles transcript with segments but no summary', () => {
    const noSummary: NormalizedTranscript = {
      ...fullTranscript,
      summary: null,
      highlights: null,
    };
    const prompt = buildIntakePrompt(noSummary);
    expect(prompt).toContain('Full Transcript:');
    expect(prompt).not.toContain('Summary:');
    expect(prompt).not.toContain('Highlights:');
    expect(prompt).toContain('[00:00:00] Sarah: Hello everyone.');
  });

  it('handles transcript with summary but no segments', () => {
    const noSegments: NormalizedTranscript = {
      ...fullTranscript,
      segments: [],
    };
    const prompt = buildIntakePrompt(noSegments);
    expect(prompt).toContain('Summary:');
    expect(prompt).toContain(
      '(No segmented transcript available — use summary above)'
    );
  });

  it('handles completely empty transcript (no segments, no summary)', () => {
    const empty: NormalizedTranscript = {
      ...fullTranscript,
      segments: [],
      summary: null,
      highlights: null,
    };
    const prompt = buildIntakePrompt(empty);
    expect(prompt).toContain(
      '(No segmented transcript available — use summary above)'
    );
    expect(prompt).not.toContain('Summary:');
  });
});
