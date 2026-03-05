import { describe, it, expect } from 'vitest';
import { formatDate, formatDateRange } from './dates';

describe('formatDate', () => {
  it('formats an ISO datetime string to a readable date', () => {
    expect(formatDate('2026-02-28T14:30:00Z')).toBe('February 28, 2026');
  });

  it('formats an ISO date string to a readable date', () => {
    expect(formatDate('2026-02-01')).toBe('February 1, 2026');
  });

  it('formats dates in different months', () => {
    expect(formatDate('2026-12-25')).toBe('December 25, 2026');
  });

  it('formats January 1st correctly', () => {
    expect(formatDate('2026-01-01')).toBe('January 1, 2026');
  });
});

describe('formatDateRange', () => {
  it('formats a same-year date range with year at the end', () => {
    const result = formatDateRange('2026-02-01', '2026-02-28');
    expect(result).toBe('February 1 \u2013 February 28, 2026');
  });

  it('formats a same-year range across different months', () => {
    const result = formatDateRange('2026-01-15', '2026-03-15');
    expect(result).toBe('January 15 \u2013 March 15, 2026');
  });

  it('formats a cross-year date range with both years', () => {
    const result = formatDateRange('2025-12-15', '2026-01-15');
    expect(result).toBe('December 15, 2025 \u2013 January 15, 2026');
  });

  it('uses en-dash (\\u2013) separator', () => {
    const result = formatDateRange('2026-02-01', '2026-02-28');
    expect(result).toContain('\u2013');
  });
});
