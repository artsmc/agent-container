import { createRemoteJWKSet } from 'jose';

type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>;

interface JwksCacheEntry {
  jwks: RemoteJWKSet;
  createdAt: number;
}

const DEFAULT_TTL_MS = 3_600_000; // 1 hour

/**
 * In-memory cache for remote JWKS key sets, keyed by JWKS URI.
 * Wraps jose's createRemoteJWKSet with TTL expiry so the key set is
 * periodically re-created (forcing a JWKS re-fetch by jose on next use).
 *
 * In-flight deduplication prevents multiple concurrent refresh requests
 * from creating duplicate remote JWKS instances for the same URI.
 */
export class JwksCache {
  private readonly entries = new Map<string, JwksCacheEntry>();
  private readonly inFlight = new Map<string, Promise<RemoteJWKSet>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * Returns the cached JWKS for the given URI, creating or refreshing it
   * if the cached entry has expired. Concurrent refresh requests for the
   * same URI are deduplicated via in-flight promise tracking.
   */
  async getJwks(jwksUri: string): Promise<RemoteJWKSet> {
    const now = Date.now();
    const entry = this.entries.get(jwksUri);

    if (entry !== undefined && now - entry.createdAt < this.ttlMs) {
      return entry.jwks;
    }

    // Check if a refresh is already in flight for this URI
    const existingInFlight = this.inFlight.get(jwksUri);
    if (existingInFlight !== undefined) {
      return existingInFlight;
    }

    const refreshPromise = this.createAndCache(jwksUri, now);
    this.inFlight.set(jwksUri, refreshPromise);

    try {
      const jwks = await refreshPromise;
      return jwks;
    } finally {
      this.inFlight.delete(jwksUri);
    }
  }

  private async createAndCache(
    jwksUri: string,
    now: number
  ): Promise<RemoteJWKSet> {
    // createRemoteJWKSet is synchronous but returns a function that fetches lazily
    const jwks = createRemoteJWKSet(new URL(jwksUri));
    this.entries.set(jwksUri, { jwks, createdAt: now });
    return jwks;
  }

  /**
   * Removes the cached entry for the given URI, forcing a fresh creation
   * on the next call to getJwks.
   */
  invalidate(jwksUri: string): void {
    this.entries.delete(jwksUri);
  }

  /**
   * Clears all cached entries.
   */
  clear(): void {
    this.entries.clear();
  }
}
