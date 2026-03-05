import { eq } from 'drizzle-orm';
import { agendas } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import { ApiError } from '../errors/api-errors';

const SHORT_ID_PATTERN = /^AGD-\d+$/i;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Determines whether a given string is an agenda short ID (e.g., AGD-0042).
 */
export function isAgendaShortId(value: string): boolean {
  return SHORT_ID_PATTERN.test(value);
}

/**
 * Resolves an agenda identifier (UUID or short ID) to a UUID.
 *
 * - If the identifier matches the AGD-#### pattern, looks up the agenda
 *   by `short_id` using the unique index.
 * - If the identifier is a UUID, returns it directly (existence check
 *   happens in the calling service).
 * - Otherwise, throws INVALID_ID_FORMAT (422).
 *
 * @throws ApiError with code AGENDA_NOT_FOUND (404) if short ID is not found
 * @throws ApiError with code INVALID_ID_FORMAT (422) if format is invalid
 */
export async function resolveAgendaId(
  idParam: string,
  db: DbClient
): Promise<string> {
  if (isAgendaShortId(idParam)) {
    const normalizedShortId = idParam.toUpperCase();
    const rows = await db
      .select({ id: agendas.id })
      .from(agendas)
      .where(eq(agendas.shortId, normalizedShortId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new ApiError(404, 'AGENDA_NOT_FOUND', `Agenda with short ID '${normalizedShortId}' not found`);
    }

    return row.id;
  }

  if (UUID_PATTERN.test(idParam)) {
    return idParam;
  }

  throw new ApiError(
    422,
    'INVALID_ID_FORMAT',
    `'${idParam}' is neither a valid UUID nor a valid short ID (AGD-####)`
  );
}
