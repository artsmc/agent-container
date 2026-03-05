/**
 * Abstracts where tokens come from, enabling each consumer
 * to inject its own auth strategy without modifying the client.
 */
export interface TokenProvider {
  /**
   * Returns a valid access token for the current session.
   * The implementation is responsible for determining freshness.
   * Called before every authenticated request.
   */
  getAccessToken(): Promise<string>;

  /**
   * Forces a token refresh and returns the new access token.
   * Called automatically by the client after a 401 response.
   * Must return a valid token or throw.
   */
  refreshAccessToken(): Promise<string>;
}

/**
 * Configuration options for the API client.
 */
export interface ApiClientOptions {
  /**
   * Base URL of the iExcel API. e.g., "https://api.iexcel.com"
   * Trailing slashes are normalised internally.
   */
  baseUrl: string;

  /**
   * Token provider for this client instance.
   * Each consumer injects its own implementation.
   */
  tokenProvider: TokenProvider;

  /**
   * Optional custom fetch implementation.
   * Defaults to global fetch (Node.js 18+).
   * Inject a mock implementation in tests.
   */
  fetchImpl?: typeof fetch;
}
