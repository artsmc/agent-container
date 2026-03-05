import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared patterns
// ---------------------------------------------------------------------------

const AGENDA_STATUSES = ['draft', 'in_review', 'finalized', 'shared'] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a date string is a valid YYYY-MM-DD calendar date.
 */
function isValidDate(dateStr: string): boolean {
  if (!DATE_PATTERN.test(dateStr)) return false;
  const d = new Date(dateStr + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

// ---------------------------------------------------------------------------
// POST /clients/{client_id}/agendas — Create draft agenda
// ---------------------------------------------------------------------------

export const createAgendaBodySchema = z
  .object({
    content: z.unknown().refine(
      (val) => val !== undefined && val !== null && val !== '',
      { message: 'content is required' }
    ),
    cycle_start: z
      .string({ required_error: 'cycle_start is required' })
      .refine(isValidDate, {
        message: 'cycle_start must be a valid date in YYYY-MM-DD format',
      }),
    cycle_end: z
      .string({ required_error: 'cycle_end is required' })
      .refine(isValidDate, {
        message: 'cycle_end must be a valid date in YYYY-MM-DD format',
      }),
    source: z.enum(['agent', 'ui', 'terminal']).optional(),
  })
  .refine(
    (data) => {
      if (data.cycle_start && data.cycle_end) {
        return data.cycle_end >= data.cycle_start;
      }
      return true;
    },
    {
      message: 'cycle_end must be on or after cycle_start',
      path: ['cycle_end'],
    }
  );

export type CreateAgendaBody = z.infer<typeof createAgendaBodySchema>;

// ---------------------------------------------------------------------------
// GET /clients/{client_id}/agendas — List agendas query params
// ---------------------------------------------------------------------------

export const listAgendasQuerySchema = z.object({
  status: z.enum(AGENDA_STATUSES).optional(),
  page: z.coerce
    .number()
    .int('page must be an integer')
    .positive('page must be a positive integer')
    .default(1),
  per_page: z.coerce
    .number()
    .int('per_page must be an integer')
    .positive('per_page must be a positive integer')
    .max(100, 'per_page must not exceed 100')
    .default(20),
});

export type ListAgendasQuery = z.infer<typeof listAgendasQuerySchema>;

// ---------------------------------------------------------------------------
// PATCH /agendas/{id} — Edit agenda
// ---------------------------------------------------------------------------

export const editAgendaBodySchema = z
  .object({
    content: z.unknown().refine(
      (val) => val !== undefined && val !== null && val !== '',
      { message: 'content must not be empty' }
    ),
    cycle_start: z.string().refine(isValidDate, {
      message: 'cycle_start must be a valid date in YYYY-MM-DD format',
    }),
    cycle_end: z.string().refine(isValidDate, {
      message: 'cycle_end must be a valid date in YYYY-MM-DD format',
    }),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one editable field must be provided',
  });

export type EditAgendaBody = z.infer<typeof editAgendaBodySchema>;

/**
 * Validates cycle_end >= cycle_start when both are present
 * (takes into account existing values from the agenda record).
 */
export function validateCycleDates(
  cycleStart: string | null,
  cycleEnd: string | null
): void {
  if (cycleStart && cycleEnd && cycleEnd < cycleStart) {
    throw Object.assign(
      new Error('cycle_end must be on or after cycle_start'),
      { field: 'cycle_end' }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /agendas/{id}/finalize — Finalize agenda
// ---------------------------------------------------------------------------

export const finalizeAgendaBodySchema = z
  .object({
    force: z.boolean().optional().default(false),
  })
  .optional()
  .default({ force: false });

export type FinalizeAgendaBody = z.infer<typeof finalizeAgendaBodySchema>;

// ---------------------------------------------------------------------------
// POST /agendas/{id}/email — Email agenda
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailAgendaBodySchema = z
  .object({
    recipients: z
      .array(
        z.string().refine((val) => EMAIL_PATTERN.test(val), {
          message: 'Invalid email address',
        })
      )
      .optional(),
  })
  .optional()
  .default({});

export type EmailAgendaBody = z.infer<typeof emailAgendaBodySchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips non-editable fields from a raw PATCH body. This ensures that
 * even if the client sends status, short_id, etc., they are silently ignored.
 */
export function stripNonEditableAgendaFields(
  rawBody: Record<string, unknown>
): Record<string, unknown> {
  const NON_EDITABLE_KEYS = [
    'status',
    'short_id',
    'shortId',
    'client_id',
    'clientId',
    'id',
    'finalized_by',
    'finalizedBy',
    'finalized_at',
    'finalizedAt',
    'shared_at',
    'sharedAt',
    'shared_url_token',
    'sharedUrlToken',
    'internal_url_token',
    'internalUrlToken',
    'google_doc_id',
    'googleDocId',
    'created_at',
    'createdAt',
    'updated_at',
    'updatedAt',
    'is_imported',
    'isImported',
    'imported_at',
    'importedAt',
    'import_source',
    'importSource',
  ];

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawBody)) {
    if (!NON_EDITABLE_KEYS.includes(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}
