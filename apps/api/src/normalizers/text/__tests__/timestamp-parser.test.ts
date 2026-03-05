import { describe, it, expect } from 'vitest';
import { parseTimestampFromLine } from '../timestamp-parser.js';

describe('parseTimestampFromLine', () => {
  it('parses bare HH:MM:SS', () => {
    expect(parseTimestampFromLine('01:23:45')).toBe(5025);
  });

  it('parses bare MM:SS', () => {
    expect(parseTimestampFromLine('03:45')).toBe(225);
  });

  it('parses bracketed [HH:MM:SS]', () => {
    expect(parseTimestampFromLine('[00:01:30]')).toBe(90);
  });

  it('parses parenthesized (HH:MM:SS)', () => {
    expect(parseTimestampFromLine('(00:05:00)')).toBe(300);
  });

  it('parses with milliseconds and truncates', () => {
    expect(parseTimestampFromLine('00:01:23.456')).toBe(83);
  });

  it('parses single-digit hour', () => {
    expect(parseTimestampFromLine('1:00:00')).toBe(3600);
  });

  it('returns null when no timestamp at start of line', () => {
    expect(parseTimestampFromLine('Mark: Hello')).toBeNull();
  });

  it('returns null when timestamp appears mid-line', () => {
    expect(parseTimestampFromLine('text [00:05:00] more text')).toBeNull();
  });

  it('parses 00:00:00 as zero seconds', () => {
    expect(parseTimestampFromLine('00:00:00')).toBe(0);
  });

  it('parses bracketed MM:SS', () => {
    expect(parseTimestampFromLine('[05:30]')).toBe(330);
  });

  it('parses parenthesized MM:SS', () => {
    expect(parseTimestampFromLine('(02:15)')).toBe(135);
  });

  it('parses timestamp followed by speaker label', () => {
    expect(parseTimestampFromLine('[00:01:30] Mark: Hello')).toBe(90);
  });

  it('handles HH:MM:SS.mmm with brackets', () => {
    expect(parseTimestampFromLine('[01:23:45.789]')).toBe(5025);
  });
});
