import { describe, it, expect } from 'vitest';
import { isAgendaShortId } from '../../utils/agenda-short-id';

// ---------------------------------------------------------------------------
// Short ID pattern matching
// ---------------------------------------------------------------------------

describe('isAgendaShortId', () => {
  it('matches AGD-0001', () => {
    expect(isAgendaShortId('AGD-0001')).toBe(true);
  });

  it('matches lowercase agd-0001', () => {
    expect(isAgendaShortId('agd-0001')).toBe(true);
  });

  it('matches AGD-10000 (5+ digits)', () => {
    expect(isAgendaShortId('AGD-10000')).toBe(true);
  });

  it('matches AGD-1', () => {
    expect(isAgendaShortId('AGD-1')).toBe(true);
  });

  it('does not match TSK-0001', () => {
    expect(isAgendaShortId('TSK-0001')).toBe(false);
  });

  it('does not match a UUID', () => {
    expect(isAgendaShortId('a1b2c3d4-0000-0000-0000-000000000001')).toBe(false);
  });

  it('does not match empty string', () => {
    expect(isAgendaShortId('')).toBe(false);
  });

  it('does not match AGD- with no digits', () => {
    expect(isAgendaShortId('AGD-')).toBe(false);
  });

  it('does not match AGD-abc', () => {
    expect(isAgendaShortId('AGD-abc')).toBe(false);
  });
});
