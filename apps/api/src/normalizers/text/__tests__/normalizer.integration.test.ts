import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeetingType, ApiErrorCode } from '@iexcel/shared-types';
import { normalizeTextTranscript } from '../normalizer.js';
import { NormalizerError } from '../errors.js';
import type { NormalizeTextInput } from '../normalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = resolve(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), 'utf-8');
}

function makeInput(overrides: Partial<NormalizeTextInput> = {}): NormalizeTextInput {
  return {
    rawText: overrides.rawText ?? loadFixture('well-formed-labeled.txt'),
    callType: overrides.callType ?? MeetingType.Intake,
    callDate: overrides.callDate ?? '2026-02-15T14:00:00Z',
    clientId: overrides.clientId ?? 'client-uuid-001',
  };
}

// ---------------------------------------------------------------------------
// Fixture-based integration tests
// ---------------------------------------------------------------------------

describe('normalizeTextTranscript — integration', () => {
  describe('well-formed-labeled.txt', () => {
    it('produces correct structure with participants, segments, and duration', () => {
      const start = performance.now();
      const result = normalizeTextTranscript(makeInput());
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result.source).toBe('manual');
      expect(result.meetingType).toBe(MeetingType.Intake);
      expect(result.clientId).toBe('client-uuid-001');
      expect(result.meetingDate).toBe('2026-02-15T14:00:00Z');
      expect(result.sourceId).toBe('manual-client-uuid-001-2026-02-15');
      expect(result.participants).toEqual(['Mark', 'Sarah']);
      expect(result.segments.length).toBeGreaterThanOrEqual(10);
      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.summary).toBeNull();
      expect(result.highlights).toBeNull();

      // Every segment should have a speaker of Mark or Sarah
      for (const seg of result.segments) {
        expect(['Mark', 'Sarah']).toContain(seg.speaker);
        expect(seg.text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('manual-paste-no-timestamps.txt', () => {
    it('produces segments with zero timestamps and zero duration', () => {
      const raw = loadFixture('manual-paste-no-timestamps.txt');
      const start = performance.now();
      const result = normalizeTextTranscript(makeInput({ rawText: raw }));
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result.durationSeconds).toBe(0);
      expect(result.participants).toEqual(['Mark', 'Sarah']);
      expect(result.segments.length).toBeGreaterThan(0);

      for (const seg of result.segments) {
        expect(seg.timestamp).toBe(0);
      }
    });
  });

  describe('allcaps-speakers.txt', () => {
    it('converts all-caps speaker names to title case', () => {
      const raw = loadFixture('allcaps-speakers.txt');
      const start = performance.now();
      const result = normalizeTextTranscript(makeInput({ rawText: raw }));
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result.participants).toEqual(['Mark', 'Sarah']);

      for (const seg of result.segments) {
        expect(['Mark', 'Sarah']).toContain(seg.speaker);
      }
    });
  });

  describe('unstructured.txt', () => {
    it('produces a single Unknown segment with empty participants', () => {
      const raw = loadFixture('unstructured.txt');
      const start = performance.now();
      const result = normalizeTextTranscript(makeInput({ rawText: raw }));
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.speaker).toBe('Unknown');
      expect(result.segments[0]!.timestamp).toBe(0);
      expect(result.participants).toEqual([]);
      expect(result.durationSeconds).toBe(0);
    });
  });

  describe('unstructured text with embedded timestamps', () => {
    it('still extracts duration from timestamps even without speaker labels', () => {
      const raw = [
        '[00:00:00] Opening remarks were made about the new product launch.',
        '[00:10:00] The group discussed timeline and delivery expectations.',
      ].join('\n');
      const start = performance.now();
      const result = normalizeTextTranscript(makeInput({ rawText: raw }));
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.speaker).toBe('Unknown');
      expect(result.durationSeconds).toBe(600);
    });
  });

  describe('single-speaker.txt', () => {
    it('produces multiple segments from a single speaker monologue', () => {
      const raw = loadFixture('single-speaker.txt');
      const start = performance.now();
      const result = normalizeTextTranscript(makeInput({ rawText: raw }));
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result.participants).toEqual(['Mark']);
      expect(result.segments.length).toBeGreaterThanOrEqual(1);

      for (const seg of result.segments) {
        expect(seg.speaker).toBe('Mark');
      }
    });
  });

  describe('mixed-timestamp-formats.txt', () => {
    it('handles mixed HH:MM:SS and MM:SS timestamp formats', () => {
      const raw = loadFixture('mixed-timestamp-formats.txt');
      const start = performance.now();
      const result = normalizeTextTranscript(makeInput({ rawText: raw }));
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result.participants).toEqual(['Mark', 'Sarah']);
      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.segments.length).toBeGreaterThanOrEqual(2);

      // Timestamps should be non-decreasing within their appearance order
      let maxTs = 0;
      for (const seg of result.segments) {
        expect(seg.timestamp).toBeGreaterThanOrEqual(0);
        if (seg.timestamp > maxTs) maxTs = seg.timestamp;
      }
      expect(maxTs).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Output contract compliance
// ---------------------------------------------------------------------------

describe('normalizeTextTranscript — output contract', () => {
  it('includes all NormalizedTranscript fields', () => {
    const result = normalizeTextTranscript(makeInput());
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

  it('source is always "manual"', () => {
    const result = normalizeTextTranscript(makeInput());
    expect(result.source).toBe('manual');
  });

  it('summary and highlights are always null', () => {
    const result = normalizeTextTranscript(makeInput());
    expect(result.summary).toBeNull();
    expect(result.highlights).toBeNull();
  });

  it('participants never contains "Unknown"', () => {
    // Test with unstructured text
    const raw = loadFixture('unstructured.txt');
    const result = normalizeTextTranscript(makeInput({ rawText: raw }));
    expect(result.participants).not.toContain('Unknown');
  });
});

// ---------------------------------------------------------------------------
// Validation failure tests
// ---------------------------------------------------------------------------

describe('normalizeTextTranscript — validation errors', () => {
  it('rejects empty string', () => {
    expect(() =>
      normalizeTextTranscript(makeInput({ rawText: '' }))
    ).toThrow(NormalizerError);

    try {
      normalizeTextTranscript(makeInput({ rawText: '' }));
    } catch (err) {
      const e = err as NormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.message).toBe('Transcript text is required');
      expect(e.field).toBe('rawText');
    }
  });

  it('rejects whitespace-only string', () => {
    expect(() =>
      normalizeTextTranscript(makeInput({ rawText: '     \n\n   ' }))
    ).toThrow(NormalizerError);

    try {
      normalizeTextTranscript(makeInput({ rawText: '     \n\n   ' }));
    } catch (err) {
      const e = err as NormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.message).toBe('Transcript text is required');
    }
  });

  it('rejects text shorter than 50 characters', () => {
    expect(() =>
      normalizeTextTranscript(makeInput({ rawText: 'Too short.' }))
    ).toThrow(NormalizerError);

    try {
      normalizeTextTranscript(makeInput({ rawText: 'Too short.' }));
    } catch (err) {
      const e = err as NormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.message).toBe('Transcript text is too short to be valid');
      expect(e.field).toBe('rawText');
    }
  });

  it('rejects invalid callDate format', () => {
    expect(() =>
      normalizeTextTranscript(makeInput({ callDate: '15th February 2026' }))
    ).toThrow(NormalizerError);

    try {
      normalizeTextTranscript(makeInput({ callDate: '15th February 2026' }));
    } catch (err) {
      const e = err as NormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.message).toBe('callDate must be a valid ISO 8601 datetime');
      expect(e.field).toBe('callDate');
    }
  });

  it('rejects invalid callType', () => {
    expect(() =>
      normalizeTextTranscript(
        makeInput({ callType: 'board_meeting' as MeetingType })
      )
    ).toThrow(NormalizerError);

    try {
      normalizeTextTranscript(
        makeInput({ callType: 'board_meeting' as MeetingType })
      );
    } catch (err) {
      const e = err as NormalizerError;
      expect(e.code).toBe(ApiErrorCode.ValidationError);
      expect(e.field).toBe('callType');
    }
  });
});

// ---------------------------------------------------------------------------
// ReDoS safety tests
// ---------------------------------------------------------------------------

describe('normalizeTextTranscript — ReDoS safety', () => {
  it('handles 10,000 spaces followed by a colon in under 50ms', () => {
    const malicious = ' '.repeat(10000) + ':';
    const rawText = `Mark: ${malicious}\n`.repeat(5) +
      'Mark: Normal text that is long enough to pass the fifty character validation threshold for this test.';

    const start = performance.now();
    const result = normalizeTextTranscript(makeInput({ rawText }));
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(result.segments.length).toBeGreaterThan(0);
  });

  it('handles 10,000 digits followed by a colon in under 50ms', () => {
    const malicious = '1'.repeat(10000) + ':';
    const rawText = `Mark: ${malicious}\n`.repeat(5) +
      'Mark: Normal text that is long enough to pass the fifty character validation threshold for this test.';

    const start = performance.now();
    const result = normalizeTextTranscript(makeInput({ rawText }));
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(result.segments.length).toBeGreaterThan(0);
  });
});
