import { describe, it, expect } from 'vitest';
import {
  normalizeSpeakerName,
  convertTimestamp,
  detectTimestampUnit,
  parseGrainSegments,
} from '../segment-parser.js';
import type { GrainSegment } from '../grain-client.js';

// ---------------------------------------------------------------------------
// Speaker name normalization
// ---------------------------------------------------------------------------

describe('normalizeSpeakerName', () => {
  it('trims whitespace', () => {
    expect(normalizeSpeakerName('  Mark  ')).toBe('Mark');
  });

  it('removes parenthetical content', () => {
    expect(normalizeSpeakerName('Mark (PM)')).toBe('Mark');
  });

  it('converts all-caps to title case', () => {
    expect(normalizeSpeakerName('SARAH')).toBe('Sarah');
  });

  it('converts multi-word all-caps to title case', () => {
    expect(normalizeSpeakerName('JOHN SMITH')).toBe('John Smith');
  });

  it('preserves mixed-case names', () => {
    expect(normalizeSpeakerName('McKenzie')).toBe('McKenzie');
  });

  it('handles all-caps with parenthetical', () => {
    expect(normalizeSpeakerName('MARK (CEO)')).toBe('Mark');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeSpeakerName('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Timestamp conversion
// ---------------------------------------------------------------------------

describe('convertTimestamp', () => {
  it('converts ms to seconds when isMs is true', () => {
    expect(convertTimestamp(75500, true)).toBe(75);
  });

  it('passes through seconds when isMs is false', () => {
    expect(convertTimestamp(120, false)).toBe(120);
  });

  it('floors fractional seconds', () => {
    expect(convertTimestamp(75999, true)).toBe(75);
  });

  it('returns 0 for negative values', () => {
    expect(convertTimestamp(-100, false)).toBe(0);
  });

  it('returns 0 for zero', () => {
    expect(convertTimestamp(0, true)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Timestamp unit detection
// ---------------------------------------------------------------------------

describe('detectTimestampUnit', () => {
  it('detects milliseconds when max > 100_000', () => {
    const segments: GrainSegment[] = [
      { speaker: 'A', start_time: 0, text: 'hello' },
      { speaker: 'B', start_time: 150_000, text: 'world' },
    ];
    expect(detectTimestampUnit(segments)).toBe(true);
  });

  it('detects seconds when max <= 100_000', () => {
    const segments: GrainSegment[] = [
      { speaker: 'A', start_time: 0, text: 'hello' },
      { speaker: 'B', start_time: 3600, text: 'world' },
    ];
    expect(detectTimestampUnit(segments)).toBe(false);
  });

  it('returns false for empty segments', () => {
    expect(detectTimestampUnit([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full segment parsing
// ---------------------------------------------------------------------------

describe('parseGrainSegments', () => {
  it('converts segments with ms timestamps to seconds', () => {
    const grainSegments: GrainSegment[] = [
      { speaker: 'Mark', start_time: 0, text: 'Hello everyone.' },
      { speaker: 'Sarah', start_time: 75500, text: 'Hi Mark.' },
      { speaker: 'Mark', start_time: 150000, text: 'Let us begin.' },
    ];

    const result = parseGrainSegments(grainSegments);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]!.timestamp).toBe(0);
    expect(result.segments[1]!.timestamp).toBe(75);
    expect(result.segments[2]!.timestamp).toBe(150);
  });

  it('filters out empty text segments', () => {
    const grainSegments: GrainSegment[] = [
      { speaker: 'Mark', start_time: 0, text: 'Hello.' },
      { speaker: 'Sarah', start_time: 1000, text: '' },
      { speaker: 'Mark', start_time: 2000, text: '   ' },
      { speaker: 'Sarah', start_time: 3000, text: 'Hi.' },
    ];

    const result = parseGrainSegments(grainSegments);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.text).toBe('Hello.');
    expect(result.segments[1]!.text).toBe('Hi.');
  });

  it('normalizes all-caps speaker names', () => {
    const grainSegments: GrainSegment[] = [
      { speaker: 'MARK', start_time: 0, text: 'Hello.' },
      { speaker: 'SARAH', start_time: 5, text: 'Hi.' },
    ];

    const result = parseGrainSegments(grainSegments);
    expect(result.segments[0]!.speaker).toBe('Mark');
    expect(result.segments[1]!.speaker).toBe('Sarah');
  });

  it('de-duplicates participants case-insensitively', () => {
    const grainSegments: GrainSegment[] = [
      { speaker: 'Mark', start_time: 0, text: 'Hello.' },
      { speaker: 'Jane', start_time: 5, text: 'Hi.' },
      { speaker: 'MARK', start_time: 10, text: 'Thanks.' },
    ];

    const result = parseGrainSegments(grainSegments);
    expect(result.participants).toEqual(['Mark', 'Jane']);
  });

  it('preserves segment order', () => {
    const grainSegments: GrainSegment[] = [
      { speaker: 'A', start_time: 0, text: 'First.' },
      { speaker: 'B', start_time: 10, text: 'Second.' },
      { speaker: 'A', start_time: 20, text: 'Third.' },
    ];

    const result = parseGrainSegments(grainSegments);
    expect(result.segments.map((s) => s.text)).toEqual([
      'First.',
      'Second.',
      'Third.',
    ]);
  });

  it('returns empty arrays for empty input', () => {
    const result = parseGrainSegments([]);
    expect(result.segments).toEqual([]);
    expect(result.participants).toEqual([]);
  });
});
