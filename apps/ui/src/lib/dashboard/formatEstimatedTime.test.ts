import { describe, it, expect } from 'vitest';
import { formatEstimatedTime } from './formatEstimatedTime';

describe('formatEstimatedTime', () => {
  it('returns "\u2014" for null', () => {
    expect(formatEstimatedTime(null)).toBe('\u2014');
  });

  it('returns "\u2014" for 0 minutes', () => {
    expect(formatEstimatedTime(0)).toBe('\u2014');
  });

  it('returns "30m" for 30 minutes', () => {
    expect(formatEstimatedTime(30)).toBe('30m');
  });

  it('returns "1h" for 60 minutes', () => {
    expect(formatEstimatedTime(60)).toBe('1h');
  });

  it('returns "1h 30m" for 90 minutes', () => {
    expect(formatEstimatedTime(90)).toBe('1h 30m');
  });

  it('returns "2h" for 120 minutes', () => {
    expect(formatEstimatedTime(120)).toBe('2h');
  });

  it('returns "2h 30m" for 150 minutes', () => {
    expect(formatEstimatedTime(150)).toBe('2h 30m');
  });

  it('returns "\u2014" for negative values', () => {
    expect(formatEstimatedTime(-10)).toBe('\u2014');
  });

  it('returns "5m" for 5 minutes', () => {
    expect(formatEstimatedTime(5)).toBe('5m');
  });
});
