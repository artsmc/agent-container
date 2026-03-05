import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CALL_TYPE_VALUES = ['client_call', 'intake', 'follow_up'] as const;
export type CallTypeValue = (typeof CALL_TYPE_VALUES)[number];

/** Maximum file upload size in bytes (5 MB). */
export const MAX_FILE_SIZE_BYTES = 5_242_880;

/** Minimum raw transcript length (trimmed) in characters. */
export const MIN_TRANSCRIPT_LENGTH = 50;

/** Allowed MIME types for file upload. */
export const ALLOWED_MIME_TYPES = ['text/plain'] as const;

/** Allowed file extensions for upload. */
export const ALLOWED_FILE_EXTENSIONS = ['.txt'] as const;

// ---------------------------------------------------------------------------
// UUID validation (re-exported for convenience)
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// ISO 8601 datetime validation
// ---------------------------------------------------------------------------

/**
 * Validates that a string is a valid ISO 8601 datetime.
 * Requires the YYYY-MM-DDT prefix and must be parseable by Date.parse.
 */
export function isValidIso8601Datetime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return false;
  }
  return !isNaN(Date.parse(value));
}

// ---------------------------------------------------------------------------
// Date string validation (YYYY-MM-DD)
// ---------------------------------------------------------------------------

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_REGEX.test(value)) {
    return false;
  }
  return !isNaN(Date.parse(value));
}

// ---------------------------------------------------------------------------
// Call type validation
// ---------------------------------------------------------------------------

const CALL_TYPE_SET: ReadonlySet<string> = new Set(CALL_TYPE_VALUES);

export function isValidCallType(value: string): value is CallTypeValue {
  return CALL_TYPE_SET.has(value);
}

// ---------------------------------------------------------------------------
// File validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates the file extension. Returns true if the extension is allowed.
 */
export function isAllowedFileExtension(filename: string): boolean {
  const lowerName = filename.toLowerCase();
  return ALLOWED_FILE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

/**
 * Validates the MIME type. Returns true if the MIME type is allowed.
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(
    mimeType.toLowerCase()
  );
}

/**
 * Validates file size. Returns true if the file is within the size limit.
 */
export function isWithinFileSizeLimit(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE_BYTES;
}

// ---------------------------------------------------------------------------
// POST /clients/:clientId/transcripts - JSON body schema
// ---------------------------------------------------------------------------

export const postTranscriptJsonBodySchema = z.object({
  raw_transcript: z
    .string()
    .min(1, 'raw_transcript must not be empty'),
  call_type: z.enum(CALL_TYPE_VALUES, {
    errorMap: () => ({
      message: `call_type must be one of: ${CALL_TYPE_VALUES.join(', ')}`,
    }),
  }),
  call_date: z.string().min(1, 'call_date is required'),
});

export type PostTranscriptJsonBody = z.infer<typeof postTranscriptJsonBodySchema>;

// ---------------------------------------------------------------------------
// GET /clients/:clientId/transcripts - query params schema
// ---------------------------------------------------------------------------

export const listTranscriptsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int('page must be an integer')
    .min(1, 'page must be at least 1')
    .default(1),
  per_page: z.coerce
    .number()
    .int('per_page must be an integer')
    .min(1, 'per_page must be at least 1')
    .max(100, 'per_page must not exceed 100')
    .default(20),
  call_type: z
    .enum(CALL_TYPE_VALUES, {
      errorMap: () => ({
        message: `call_type must be one of: ${CALL_TYPE_VALUES.join(', ')}`,
      }),
    })
    .optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});

export type ListTranscriptsQuery = z.infer<typeof listTranscriptsQuerySchema>;
