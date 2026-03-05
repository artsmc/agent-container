import { describe, it, expect } from 'vitest';
import { parseSpeakerFromLine, deduplicateParticipants } from '../speaker-parser.js';

describe('parseSpeakerFromLine', () => {
  it('parses simple name with colon', () => {
    const result = parseSpeakerFromLine('Mark: Hello everyone');
    expect(result).not.toBeNull();
    expect(result!.speaker).toBe('Mark');
    expect(result!.remainingText).toBe('Hello everyone');
  });

  it('parses name with parenthetical role', () => {
    const result = parseSpeakerFromLine('Mark (PM): We need to revisit');
    expect(result).not.toBeNull();
    expect(result!.speaker).toBe('Mark');
    expect(result!.remainingText).toBe('We need to revisit');
  });

  it('converts all-caps name to title case', () => {
    const result = parseSpeakerFromLine('SARAH: Good morning');
    expect(result).not.toBeNull();
    expect(result!.speaker).toBe('Sarah');
  });

  it('parses Speaker N format', () => {
    const result = parseSpeakerFromLine('Speaker 1: First item');
    expect(result).not.toBeNull();
    expect(result!.speaker).toBe('Speaker 1');
  });

  it('handles space before colon', () => {
    const result = parseSpeakerFromLine('Sarah : Thanks for joining');
    expect(result).not.toBeNull();
    expect(result!.speaker).toBe('Sarah');
  });

  it('returns null for non-speaker line', () => {
    const result = parseSpeakerFromLine('This is body text.');
    expect(result).toBeNull();
  });

  it('returns null for line starting with a number', () => {
    const result = parseSpeakerFromLine('123: some text');
    expect(result).toBeNull();
  });

  it('parses multi-word speaker name', () => {
    const result = parseSpeakerFromLine('John Smith: Good morning');
    expect(result).not.toBeNull();
    expect(result!.speaker).toBe('John Smith');
  });

  it('converts all-caps multi-word name to title case', () => {
    const result = parseSpeakerFromLine('JOHN SMITH: Hello');
    expect(result).not.toBeNull();
    expect(result!.speaker).toBe('John Smith');
  });
});

describe('deduplicateParticipants', () => {
  it('deduplicates case-insensitively preserving first occurrence', () => {
    expect(deduplicateParticipants(['mark', 'Mark', 'MARK'])).toEqual([
      'mark',
    ]);
  });

  it('preserves order of first appearance', () => {
    expect(deduplicateParticipants(['Sarah', 'Mark', 'sarah'])).toEqual([
      'Sarah',
      'Mark',
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateParticipants([])).toEqual([]);
  });

  it('handles already unique names', () => {
    expect(deduplicateParticipants(['Mark', 'Sarah', 'Alex'])).toEqual([
      'Mark',
      'Sarah',
      'Alex',
    ]);
  });
});
