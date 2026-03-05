import { describe, it, expect } from 'vitest';
import {
  createAgendaBodySchema,
  listAgendasQuerySchema,
  editAgendaBodySchema,
  finalizeAgendaBodySchema,
  emailAgendaBodySchema,
  stripNonEditableAgendaFields,
  validateCycleDates,
} from '../../validators/agenda-validators';

// ---------------------------------------------------------------------------
// Create agenda body validation
// ---------------------------------------------------------------------------

describe('createAgendaBodySchema', () => {
  it('accepts a valid body with all required fields', () => {
    const result = createAgendaBodySchema.safeParse({
      content: { type: 'doc', content: [] },
      cycle_start: '2026-03-01',
      cycle_end: '2026-03-15',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a string content value', () => {
    const result = createAgendaBodySchema.safeParse({
      content: 'Meeting notes here',
      cycle_start: '2026-03-01',
      cycle_end: '2026-03-15',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing content', () => {
    const result = createAgendaBodySchema.safeParse({
      cycle_start: '2026-03-01',
      cycle_end: '2026-03-15',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string content', () => {
    const result = createAgendaBodySchema.safeParse({
      content: '',
      cycle_start: '2026-03-01',
      cycle_end: '2026-03-15',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing cycle_start', () => {
    const result = createAgendaBodySchema.safeParse({
      content: 'test',
      cycle_end: '2026-03-15',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing cycle_end', () => {
    const result = createAgendaBodySchema.safeParse({
      content: 'test',
      cycle_start: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects cycle_end before cycle_start', () => {
    const result = createAgendaBodySchema.safeParse({
      content: 'test',
      cycle_start: '2026-03-15',
      cycle_end: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('accepts same-day cycle dates', () => {
    const result = createAgendaBodySchema.safeParse({
      content: 'test',
      cycle_start: '2026-03-15',
      cycle_end: '2026-03-15',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date format', () => {
    const result = createAgendaBodySchema.safeParse({
      content: 'test',
      cycle_start: '03/01/2026',
      cycle_end: '2026-03-15',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional source field', () => {
    const result = createAgendaBodySchema.safeParse({
      content: 'test',
      cycle_start: '2026-03-01',
      cycle_end: '2026-03-15',
      source: 'terminal',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('terminal');
    }
  });
});

// ---------------------------------------------------------------------------
// List agendas query validation
// ---------------------------------------------------------------------------

describe('listAgendasQuerySchema', () => {
  it('accepts empty query (uses defaults)', () => {
    const result = listAgendasQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.per_page).toBe(20);
    }
  });

  it('accepts valid status filter', () => {
    const result = listAgendasQuerySchema.safeParse({ status: 'draft' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = listAgendasQuerySchema.safeParse({ status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('caps per_page at 100', () => {
    const result = listAgendasQuerySchema.safeParse({ per_page: '150' });
    expect(result.success).toBe(false);
  });

  it('rejects negative page', () => {
    const result = listAgendasQuerySchema.safeParse({ page: '-1' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edit agenda body validation
// ---------------------------------------------------------------------------

describe('editAgendaBodySchema', () => {
  it('accepts content-only update', () => {
    const result = editAgendaBodySchema.safeParse({ content: 'new content' });
    expect(result.success).toBe(true);
  });

  it('accepts cycle_start update', () => {
    const result = editAgendaBodySchema.safeParse({ cycle_start: '2026-04-01' });
    expect(result.success).toBe(true);
  });

  it('rejects empty body', () => {
    const result = editAgendaBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const result = editAgendaBodySchema.safeParse({ cycle_end: 'not-a-date' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Finalize agenda body validation
// ---------------------------------------------------------------------------

describe('finalizeAgendaBodySchema', () => {
  it('defaults force to false', () => {
    const result = finalizeAgendaBodySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.force).toBe(false);
    }
  });

  it('accepts force: true', () => {
    const result = finalizeAgendaBodySchema.safeParse({ force: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.force).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Email agenda body validation
// ---------------------------------------------------------------------------

describe('emailAgendaBodySchema', () => {
  it('accepts empty body (no recipients override)', () => {
    const result = emailAgendaBodySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid recipients', () => {
    const result = emailAgendaBodySchema.safeParse({
      recipients: ['user@example.com', 'other@test.com'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email address', () => {
    const result = emailAgendaBodySchema.safeParse({
      recipients: ['not-an-email'],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripNonEditableAgendaFields
// ---------------------------------------------------------------------------

describe('stripNonEditableAgendaFields', () => {
  it('strips non-editable fields', () => {
    const raw = {
      content: 'new content',
      status: 'finalized',
      short_id: 'AGD-0001',
      id: '123',
      finalized_by: 'user-id',
      cycle_start: '2026-04-01',
    };
    const result = stripNonEditableAgendaFields(raw);
    expect(result).toEqual({
      content: 'new content',
      cycle_start: '2026-04-01',
    });
  });

  it('preserves editable fields', () => {
    const raw = {
      content: 'test',
      cycle_start: '2026-03-01',
      cycle_end: '2026-03-15',
    };
    const result = stripNonEditableAgendaFields(raw);
    expect(result).toEqual(raw);
  });
});

// ---------------------------------------------------------------------------
// validateCycleDates
// ---------------------------------------------------------------------------

describe('validateCycleDates', () => {
  it('does not throw for valid dates', () => {
    expect(() => validateCycleDates('2026-03-01', '2026-03-15')).not.toThrow();
  });

  it('does not throw for same-day dates', () => {
    expect(() => validateCycleDates('2026-03-01', '2026-03-01')).not.toThrow();
  });

  it('throws for cycle_end before cycle_start', () => {
    expect(() => validateCycleDates('2026-03-15', '2026-03-01')).toThrow();
  });

  it('does not throw when both are null', () => {
    expect(() => validateCycleDates(null, null)).not.toThrow();
  });
});
