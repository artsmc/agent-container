import { describe, it, expect } from 'vitest';
import { buildSegments } from '../segment-builder.js';

describe('buildSegments', () => {
  it('produces two segments for two alternating speakers', () => {
    const lines = [
      'Mark: Hello everyone.',
      'Sarah: Good to see you.',
    ];
    const segments = buildSegments(lines);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.speaker).toBe('Mark');
    expect(segments[0]!.text).toBe('Hello everyone.');
    expect(segments[1]!.speaker).toBe('Sarah');
    expect(segments[1]!.text).toBe('Good to see you.');
  });

  it('merges multi-line speaker turn into one segment', () => {
    const lines = [
      'Mark: First line of thought.',
      'Continuing the discussion here.',
      'And a third line.',
      'Sarah: My turn now.',
    ];
    const segments = buildSegments(lines);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.speaker).toBe('Mark');
    expect(segments[0]!.text).toContain('First line of thought.');
    expect(segments[0]!.text).toContain('Continuing the discussion here.');
    expect(segments[0]!.text).toContain('And a third line.');
    expect(segments[1]!.speaker).toBe('Sarah');
  });

  it('omits empty speaker turn', () => {
    const lines = [
      'Mark:',
      'Sarah: Thanks for joining.',
      'Mark: Of course.',
    ];
    const segments = buildSegments(lines);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.speaker).toBe('Sarah');
    expect(segments[1]!.speaker).toBe('Mark');
  });

  it('returns single Unknown segment when no speaker labels found', () => {
    const lines = [
      'This is plain text without any speaker labels.',
      'It continues for multiple lines with various content.',
    ];
    const segments = buildSegments(lines);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.speaker).toBe('Unknown');
    expect(segments[0]!.timestamp).toBe(0);
    expect(segments[0]!.text).toContain('plain text without any speaker labels');
  });

  it('inherits timestamp from previous segment when none provided', () => {
    const lines = [
      '[00:00:10] Mark: Starting now.',
      'Sarah: Thanks for the intro.',
      'Mark: Let me continue.',
      '[00:02:00] Sarah: Moving to next topic.',
    ];
    const segments = buildSegments(lines);
    expect(segments).toHaveLength(4);
    expect(segments[0]!.timestamp).toBe(10);
    expect(segments[1]!.timestamp).toBe(10); // inherits from Mark
    expect(segments[2]!.timestamp).toBe(10); // inherits from previous
    expect(segments[3]!.timestamp).toBe(120);
  });

  it('handles blank lines between segments gracefully', () => {
    const lines = [
      'Mark: Hello.',
      '',
      '',
      'Sarah: Hi there.',
    ];
    const segments = buildSegments(lines);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.speaker).toBe('Mark');
    expect(segments[1]!.speaker).toBe('Sarah');
  });

  it('assigns timestamp 0 when no timestamps exist', () => {
    const lines = [
      'Mark: Hello.',
      'Sarah: Hi.',
    ];
    const segments = buildSegments(lines);
    expect(segments[0]!.timestamp).toBe(0);
    expect(segments[1]!.timestamp).toBe(0);
  });
});
