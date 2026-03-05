import { describe, it, expect } from 'vitest';
import { parseIsoDurationToMinutes } from './parseIsoDuration';

describe('parseIsoDurationToMinutes', () => {
  it('returns null for null input', () => {
    expect(parseIsoDurationToMinutes(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseIsoDurationToMinutes('')).toBeNull();
  });

  it('parses "PT2H30M" to 150', () => {
    expect(parseIsoDurationToMinutes('PT2H30M')).toBe(150);
  });

  it('parses "PT1H" to 60', () => {
    expect(parseIsoDurationToMinutes('PT1H')).toBe(60);
  });

  it('parses "PT30M" to 30', () => {
    expect(parseIsoDurationToMinutes('PT30M')).toBe(30);
  });

  it('parses "PT0H0M" (edge case) to null', () => {
    expect(parseIsoDurationToMinutes('PT0H0M')).toBeNull();
  });

  it('returns null for unparseable strings', () => {
    expect(parseIsoDurationToMinutes('invalid')).toBeNull();
  });

  it('parses "PT10H" to 600', () => {
    expect(parseIsoDurationToMinutes('PT10H')).toBe(600);
  });

  it('parses "PT5M" to 5', () => {
    expect(parseIsoDurationToMinutes('PT5M')).toBe(5);
  });
});
