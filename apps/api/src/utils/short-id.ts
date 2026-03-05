import { eq } from 'drizzle-orm';
import { tasks } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';
import { ApiError } from '../errors/api-errors';

const SHORT_ID_PATTERN = /^TSK-\d+$/i;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Determines whether a given string is a task short ID (e.g., TSK-0042).
 */
export function isShortId(value: string): boolean {
  return SHORT_ID_PATTERN.test(value);
}

/**
 * Determines whether a given string is a valid UUID.
 */
export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Resolves a task identifier (UUID or short ID) to a UUID.
 *
 * - If the identifier matches the TSK-#### pattern, looks up the task
 *   by `short_id` using the unique index.
 * - If the identifier is a UUID, returns it directly (existence check
 *   happens in the calling service).
 * - Otherwise, throws INVALID_ID_FORMAT (422).
 *
 * @throws ApiError with code TASK_NOT_FOUND (404) if short ID is not found
 * @throws ApiError with code INVALID_ID_FORMAT (422) if format is invalid
 */
export async function resolveTaskId(
  idParam: string,
  db: DbClient
): Promise<string> {
  if (isShortId(idParam)) {
    const normalizedShortId = idParam.toUpperCase();
    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.shortId, normalizedShortId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new ApiError(404, 'TASK_NOT_FOUND', `Task with short ID '${normalizedShortId}' not found`);
    }

    return row.id;
  }

  if (isValidUuid(idParam)) {
    return idParam;
  }

  throw new ApiError(
    422,
    'INVALID_ID_FORMAT',
    `'${idParam}' is neither a valid UUID nor a valid short ID (TSK-####)`
  );
}
