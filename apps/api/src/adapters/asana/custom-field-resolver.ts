/**
 * Custom Field Resolver
 *
 * Resolves Asana custom field enum display names to their GIDs
 * by fetching the field definition from the Asana API.
 *
 * Maintains a per-field in-memory cache with a 5-minute TTL
 * to avoid per-push API calls for enum option lookups.
 */

import { logger } from './logger';

interface EnumOption {
  gid: string;
  name: string;
}

interface CacheEntry {
  options: EnumOption[];
  fetchedAt: number;
}

const ENUM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const enumCache = new Map<string, CacheEntry>();

/**
 * Fetches enum options for a custom field from the Asana API.
 * Returns cached data if the TTL has not expired.
 */
async function getEnumOptions(
  fieldGid: string,
  accessToken: string,
): Promise<EnumOption[]> {
  const cached = enumCache.get(fieldGid);
  if (cached && Date.now() - cached.fetchedAt < ENUM_CACHE_TTL_MS) {
    return cached.options;
  }

  const response = await fetch(
    `https://app.asana.com/api/1.0/custom_fields/${fieldGid}?opt_fields=enum_options`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  const body = (await response.json()) as {
    data?: { enum_options?: EnumOption[] };
  };
  const options: EnumOption[] = body.data?.enum_options ?? [];

  enumCache.set(fieldGid, { options, fetchedAt: Date.now() });
  return options;
}

/**
 * Resolves a display name to the corresponding Asana enum option GID.
 *
 * Uses case-insensitive matching. Returns null if no match is found
 * (non-fatal -- the field should be omitted from the payload).
 *
 * @param fieldGid    - The Asana custom field GID.
 * @param displayName - The display name to resolve (e.g., "Total Life", "Backlog").
 * @param accessToken - The Asana access token for the workspace.
 * @param fieldLabel  - A human-readable label for log messages (e.g., "Client").
 */
export async function resolveEnumOptionGid(
  fieldGid: string,
  displayName: string,
  accessToken: string,
  fieldLabel: string,
): Promise<string | null> {
  const options = await getEnumOptions(fieldGid, accessToken);
  const lowerName = displayName.toLowerCase();
  const match = options.find((o) => o.name.toLowerCase() === lowerName);

  if (!match) {
    logger.warn(
      { fieldName: fieldLabel, displayName, fieldGid },
      'Asana custom field enum option not found',
    );
    return null;
  }

  return match.gid;
}

/**
 * Clears the enum option cache. Exposed for testing only.
 */
export function _clearEnumCache(): void {
  enumCache.clear();
}

/**
 * Returns the raw cache map. Exposed for testing only.
 */
export function _getEnumCache(): Map<string, CacheEntry> {
  return enumCache;
}
