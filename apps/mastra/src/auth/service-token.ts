/**
 * ServiceTokenManager — thin wrapper around createClientCredentialsClient.
 *
 * The underlying client (from @iexcel/auth-client) already handles:
 *   - In-memory token caching with configurable expiry buffer
 *   - Concurrent request deduplication (single in-flight fetch)
 *   - Proactive refresh before token expiry
 *
 * This class adds:
 *   - Startup validation via initialize() with retry logic
 *   - A stable interface for the rest of the Mastra app to consume
 */
import { createClientCredentialsClient } from '@iexcel/auth-client/client-credentials';

interface ServiceTokenManagerConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes?: string;
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ServiceTokenManager {
  private readonly client: ReturnType<typeof createClientCredentialsClient>;

  constructor(config: ServiceTokenManagerConfig) {
    this.client = createClientCredentialsClient({
      issuerUrl: config.issuerUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scope: config.scopes,
    });
  }

  /**
   * Validates connectivity to the auth issuer at startup by fetching an
   * initial token. Retries up to RETRY_ATTEMPTS times with RETRY_DELAY_MS
   * between each attempt before throwing.
   *
   * Call this once during application boot before registering agents.
   */
  async initialize(): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        await this.client.getAccessToken();
        return;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    }

    throw new Error(
      `ServiceTokenManager failed to obtain an initial token after ${RETRY_ATTEMPTS} attempts. ` +
        `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }

  /**
   * Returns a valid access token, refreshing transparently if needed.
   * Safe to call on every outbound request — the underlying client
   * returns the cached token when it is still fresh.
   */
  async getToken(): Promise<string> {
    return this.client.getAccessToken();
  }
}
