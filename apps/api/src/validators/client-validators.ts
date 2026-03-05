import { z } from 'zod';

// ---------------------------------------------------------------------------
// UUID validation
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true if the given string is a valid UUID v4 format.
 */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// Email recipient schema
// ---------------------------------------------------------------------------

export const emailRecipientSchema = z.object({
  name: z.string(),
  email: z.string().email('Invalid email format'),
  role: z.string().optional(),
});

// ---------------------------------------------------------------------------
// PATCH /clients/:id body schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for the PATCH /clients/:id request body.
 *
 * Rules:
 * - All fields are optional, but at least one must be provided.
 * - Unknown fields are rejected (strict mode).
 * - `name` must be non-empty and max 255 characters.
 * - Nullable string fields (`grain_playlist_id`, etc.) accept string or null.
 * - `email_recipients` max 50 items, each with valid name + email.
 */
export const patchClientBodySchema = z
  .object({
    name: z
      .string()
      .min(1, 'name must not be empty')
      .max(255, 'name must be at most 255 characters'),
    grain_playlist_id: z
      .string()
      .max(500, 'grain_playlist_id must be at most 500 characters')
      .nullable(),
    default_asana_workspace_id: z
      .string()
      .max(500, 'default_asana_workspace_id must be at most 500 characters')
      .nullable(),
    default_asana_project_id: z
      .string()
      .max(500, 'default_asana_project_id must be at most 500 characters')
      .nullable(),
    email_recipients: z
      .array(emailRecipientSchema)
      .max(50, 'email_recipients must have at most 50 items'),
  })
  .strict()
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type PatchClientBody = z.infer<typeof patchClientBodySchema>;

// ---------------------------------------------------------------------------
// GET /clients query params schema
// ---------------------------------------------------------------------------

export const listClientsQuerySchema = z.object({
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

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
