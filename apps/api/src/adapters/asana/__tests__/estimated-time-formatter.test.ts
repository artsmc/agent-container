import { describe, it, expect } from 'vitest';
import { formatEstimatedTime } from '../estimated-time-formatter';

describe('formatEstimatedTime', () => {
  it('converts "02:30" + h_m format to "2h 30m"', () => {
    expect(formatEstimatedTime('02:30', 'h_m')).toBe('2h 30m');
  });

  it('converts "03:00" + h_m format to "3h 0m"', () => {
    expect(formatEstimatedTime('03:00', 'h_m')).toBe('3h 0m');
  });

  it('converts "00:45" + h_m format to "0h 45m"', () => {
    expect(formatEstimatedTime('00:45', 'h_m')).toBe('0h 45m');
  });

  it('converts "02:30" + hh_mm format to "02:30"', () => {
    expect(formatEstimatedTime('02:30', 'hh_mm')).toBe('02:30');
  });

  it('returns null for unparseable string "not-a-time"', () => {
    expect(formatEstimatedTime('not-a-time', 'h_m')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(formatEstimatedTime(null, 'h_m')).toBeNull();
  });

  it('defaults to h_m format when no format is specified', () => {
    expect(formatEstimatedTime('01:15')).toBe('1h 15m');
  });

  it('handles single-digit hours like "9:05"', () => {
    expect(formatEstimatedTime('9:05', 'h_m')).toBe('9h 5m');
  });

  it('returns null for input with extra characters', () => {
    expect(formatEstimatedTime('02:30:00', 'h_m')).toBeNull();
  });
});
