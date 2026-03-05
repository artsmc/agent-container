/**
 * Resolves a client identifier (UUID or name) to a { id, name } pair.
 *
 * If the input looks like a UUID, we fetch the client directly.
 * Otherwise, we search by name and handle zero/multiple matches.
 *
 * @see Feature 21 — FR-130, FR-131, FR-132
 */
import type { ApiClient } from '@iexcel/api-client';

// Simple UUID v4 pattern check
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ClientNotFoundError extends Error {
  constructor(public readonly clientParam: string) {
    super(`No client named '${clientParam}' found. Use list_clients to see available clients.`);
    this.name = 'ClientNotFoundError';
  }
}

export class AmbiguousClientError extends Error {
  constructor(public readonly clientParam: string) {
    super(`Multiple clients match '${clientParam}'. Use list_clients to find the exact client name or ID.`);
    this.name = 'AmbiguousClientError';
  }
}

/**
 * Resolve a client parameter to { id, name }.
 *
 * @param apiClient - User-scoped API client
 * @param clientParam - UUID or client name string
 * @returns Resolved client with id and name
 * @throws ClientNotFoundError if no matching client
 * @throws AmbiguousClientError if multiple matches by name
 */
export async function resolveClient(
  apiClient: ApiClient,
  clientParam: string,
): Promise<{ id: string; name: string }> {
  if (UUID_RE.test(clientParam)) {
    const client = await apiClient.getClient(clientParam);
    return { id: client.id, name: client.name };
  }

  // Search by name — the API handles case-insensitive matching (FR-132)
  const results = await apiClient.listClients({ limit: 10 });

  // Filter client-side by name (case-insensitive partial match)
  const matches = results.data.filter(
    (c) => c.name.toLowerCase() === clientParam.toLowerCase(),
  );

  if (matches.length === 0) {
    // Try a looser match before giving up
    const partialMatches = results.data.filter(
      (c) => c.name.toLowerCase().includes(clientParam.toLowerCase()),
    );
    if (partialMatches.length === 1) {
      return { id: partialMatches[0].id, name: partialMatches[0].name };
    }
    if (partialMatches.length > 1) {
      throw new AmbiguousClientError(clientParam);
    }
    throw new ClientNotFoundError(clientParam);
  }

  if (matches.length > 1) {
    throw new AmbiguousClientError(clientParam);
  }

  return { id: matches[0].id, name: matches[0].name };
}
