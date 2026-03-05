import { describe, it, expect } from 'vitest';
import { getEntityRoute } from './get-entity-route';

describe('getEntityRoute', () => {
  it('returns /tasks/{shortId} for task entity type', () => {
    expect(getEntityRoute('task', 'TSK-0042')).toBe('/tasks/TSK-0042');
  });

  it('returns /agendas/{shortId} for agenda entity type', () => {
    expect(getEntityRoute('agenda', 'AGD-0015')).toBe('/agendas/AGD-0015');
  });

  it('returns /clients/{shortId} for client entity type', () => {
    expect(getEntityRoute('client', 'CLT-001')).toBe('/clients/CLT-001');
  });

  it('returns null for transcript entity type (no route in V1)', () => {
    expect(getEntityRoute('transcript', 'TRN-0001')).toBeNull();
  });

  it('returns null for unknown entity type', () => {
    expect(getEntityRoute('unknown_type', 'X-001')).toBeNull();
  });

  it('returns null when entityShortId is null', () => {
    expect(getEntityRoute('task', null)).toBeNull();
  });

  it('returns null when entityShortId is null for agenda', () => {
    expect(getEntityRoute('agenda', null)).toBeNull();
  });
});
