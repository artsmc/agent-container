import { describe, it, expect } from 'vitest';
import {
  isValidUuid,
  isValidIso8601Datetime,
  isValidDateString,
  isValidCallType,
  isAllowedFileExtension,
  isAllowedMimeType,
  isWithinFileSizeLimit,
  MAX_FILE_SIZE_BYTES,
  listTranscriptsQuerySchema,
  postTranscriptJsonBodySchema,
} from '../../validators/transcript-validators';

// ---------------------------------------------------------------------------
// UUID validation
// ---------------------------------------------------------------------------

describe('isValidUuid', () => {
  it('accepts a valid v4 UUID', () => {
    expect(isValidUuid('a1b2c3d4-0000-0000-0000-000000000001')).toBe(true);
  });

  it('accepts a valid v4 UUID with uppercase', () => {
    expect(isValidUuid('A1B2C3D4-0000-0000-0000-000000000001')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidUuid('')).toBe(false);
  });

  it('rejects a non-UUID string', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
  });

  it('rejects a UUID-like string with wrong format', () => {
    expect(isValidUuid('a1b2c3d4-0000-0000-0000')).toBe(false);
  });

  it('rejects a string with invalid hex characters', () => {
    expect(isValidUuid('g1b2c3d4-0000-0000-0000-000000000001')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// call_type enum validation
// ---------------------------------------------------------------------------

describe('isValidCallType', () => {
  it('accepts "client_call"', () => {
    expect(isValidCallType('client_call')).toBe(true);
  });

  it('accepts "intake"', () => {
    expect(isValidCallType('intake')).toBe(true);
  });

  it('accepts "follow_up"', () => {
    expect(isValidCallType('follow_up')).toBe(true);
  });

  it('rejects an invalid call type string', () => {
    expect(isValidCallType('weekly_standup')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidCallType('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ISO 8601 datetime validation
// ---------------------------------------------------------------------------

describe('isValidIso8601Datetime', () => {
  it('accepts a valid ISO 8601 datetime with Z timezone', () => {
    expect(isValidIso8601Datetime('2026-03-03T14:00:00Z')).toBe(true);
  });

  it('accepts a valid ISO 8601 datetime with offset', () => {
    expect(isValidIso8601Datetime('2026-03-03T14:00:00+05:00')).toBe(true);
  });

  it('accepts a valid ISO 8601 datetime with milliseconds', () => {
    expect(isValidIso8601Datetime('2026-03-03T14:00:00.000Z')).toBe(true);
  });

  it('rejects a date-only string (no time component)', () => {
    expect(isValidIso8601Datetime('2026-03-03')).toBe(false);
  });

  it('rejects a non-date string', () => {
    expect(isValidIso8601Datetime('March 3 2026')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidIso8601Datetime('')).toBe(false);
  });

  it('rejects a malformed datetime', () => {
    expect(isValidIso8601Datetime('2026-13-03T14:00:00Z')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Date string validation (YYYY-MM-DD)
// ---------------------------------------------------------------------------

describe('isValidDateString', () => {
  it('accepts a valid YYYY-MM-DD date', () => {
    expect(isValidDateString('2026-03-03')).toBe(true);
  });

  it('rejects a datetime string', () => {
    expect(isValidDateString('2026-03-03T14:00:00Z')).toBe(false);
  });

  it('rejects an invalid date', () => {
    expect(isValidDateString('not-a-date')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidDateString('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

describe('isAllowedMimeType', () => {
  it('accepts text/plain MIME type', () => {
    expect(isAllowedMimeType('text/plain')).toBe(true);
  });

  it('rejects application/pdf MIME type', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(false);
  });

  it('rejects application/json MIME type', () => {
    expect(isAllowedMimeType('application/json')).toBe(false);
  });
});

describe('isAllowedFileExtension', () => {
  it('accepts .txt extension', () => {
    expect(isAllowedFileExtension('transcript.txt')).toBe(true);
  });

  it('accepts .TXT extension (case-insensitive)', () => {
    expect(isAllowedFileExtension('transcript.TXT')).toBe(true);
  });

  it('rejects .pdf extension', () => {
    expect(isAllowedFileExtension('transcript.pdf')).toBe(false);
  });

  it('rejects file with no extension', () => {
    expect(isAllowedFileExtension('transcript')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// File size limit
// ---------------------------------------------------------------------------

describe('isWithinFileSizeLimit', () => {
  it('accepts a file at exactly 5 MB (5,242,880 bytes)', () => {
    expect(isWithinFileSizeLimit(MAX_FILE_SIZE_BYTES)).toBe(true);
  });

  it('accepts a file under 5 MB', () => {
    expect(isWithinFileSizeLimit(MAX_FILE_SIZE_BYTES - 1)).toBe(true);
  });

  it('rejects a file at 5 MB + 1 byte', () => {
    expect(isWithinFileSizeLimit(MAX_FILE_SIZE_BYTES + 1)).toBe(false);
  });

  it('accepts a zero-byte file', () => {
    expect(isWithinFileSizeLimit(0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

describe('postTranscriptJsonBodySchema', () => {
  it('accepts a valid body', () => {
    const result = postTranscriptJsonBodySchema.safeParse({
      raw_transcript: 'Some transcript text here',
      call_type: 'client_call',
      call_date: '2026-03-03T14:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing raw_transcript', () => {
    const result = postTranscriptJsonBodySchema.safeParse({
      call_type: 'client_call',
      call_date: '2026-03-03T14:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing call_type', () => {
    const result = postTranscriptJsonBodySchema.safeParse({
      raw_transcript: 'Some transcript text here',
      call_date: '2026-03-03T14:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid call_type', () => {
    const result = postTranscriptJsonBodySchema.safeParse({
      raw_transcript: 'Some transcript text here',
      call_type: 'weekly_standup',
      call_date: '2026-03-03T14:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing call_date', () => {
    const result = postTranscriptJsonBodySchema.safeParse({
      raw_transcript: 'Some transcript text here',
      call_type: 'client_call',
    });
    expect(result.success).toBe(false);
  });
});

describe('listTranscriptsQuerySchema', () => {
  it('applies defaults for page and per_page', () => {
    const result = listTranscriptsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.per_page).toBe(20);
    }
  });

  it('rejects per_page > 100', () => {
    const result = listTranscriptsQuerySchema.safeParse({ per_page: 200 });
    expect(result.success).toBe(false);
  });

  it('rejects page < 1', () => {
    const result = listTranscriptsQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('accepts valid call_type filter', () => {
    const result = listTranscriptsQuerySchema.safeParse({
      call_type: 'intake',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid call_type filter', () => {
    const result = listTranscriptsQuerySchema.safeParse({
      call_type: 'quarterly_review',
    });
    expect(result.success).toBe(false);
  });
});
