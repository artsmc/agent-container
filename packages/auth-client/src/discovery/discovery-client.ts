import type { OidcDiscoveryDocument, DiscoveryOptions } from '../types/index.js';
import { DiscoveryError } from '../types/index.js';

interface CacheEntry {
  document: OidcDiscoveryDocument;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 3_600_000; // 1 hour

/**
 * Module-level in-memory cache keyed by issuer URL.
 * Isolated per process; not shared across module boundaries.
 */
const cache = new Map<string, CacheEntry>();

/**
 * Fetches and caches the OIDC Discovery Document from
 * `{issuerUrl}/.well-known/openid-configuration`.
 *
 * Results are cached in-memory with a configurable TTL (default 1 hour).
 *
 * @throws {DiscoveryError} when the network request fails or the response
 *   is not a valid JSON object containing at minimum an `issuer` field.
 */
export async function getDiscoveryDocument(
  issuerUrl: string,
  options?: DiscoveryOptions
): Promise<OidcDiscoveryDocument> {
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const now = Date.now();

  const cached = cache.get(issuerUrl);
  if (cached !== undefined && cached.expiresAt > now) {
    return cached.document;
  }

  const discoveryUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;

  let response: Response;
  try {
    response = await fetchImpl(discoveryUrl, {
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DiscoveryError(
      `Network error fetching discovery document from ${discoveryUrl}`,
      cause
    );
  }

  if (!response.ok) {
    throw new DiscoveryError(
      `Discovery endpoint returned HTTP ${response.status} for ${discoveryUrl}`
    );
  }

  let document: unknown;
  try {
    document = await response.json();
  } catch (cause) {
    throw new DiscoveryError(
      `Failed to parse discovery document from ${discoveryUrl} as JSON`,
      cause
    );
  }

  if (
    typeof document !== 'object' ||
    document === null ||
    !('issuer' in document) ||
    typeof (document as Record<string, unknown>)['issuer'] !== 'string'
  ) {
    throw new DiscoveryError(
      `Invalid discovery document from ${discoveryUrl}: missing required "issuer" field`
    );
  }

  const typed = document as OidcDiscoveryDocument;

  cache.set(issuerUrl, {
    document: typed,
    expiresAt: now + cacheTtlMs,
  });

  return typed;
}

/**
 * Clears the in-memory discovery document cache.
 * Primarily useful in tests to ensure isolation between test cases.
 */
export function clearDiscoveryCache(): void {
  cache.clear();
}
