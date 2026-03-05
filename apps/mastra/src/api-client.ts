/**
 * Shared API client instance for Mastra tools and agents.
 *
 * Lazily initialized on first access. The ServiceTokenManager must be
 * initialized before the first API call (guaranteed by the Mastra boot
 * sequence in src/index.ts).
 */
import { createApiClient, type ApiClient } from '@iexcel/api-client';
import { env } from './config/env.js';
import { ServiceTokenManager } from './auth/service-token.js';

let _apiClient: ApiClient | null = null;
let _serviceTokenManager: ServiceTokenManager | null = null;

/**
 * Initializes the shared API client and service token manager.
 * Must be called once during application boot before any tool executions.
 */
export function initializeApiClient(serviceTokenManager: ServiceTokenManager): void {
  _serviceTokenManager = serviceTokenManager;
  _apiClient = createApiClient({
    baseUrl: env.API_BASE_URL,
    tokenProvider: {
      getAccessToken: () => serviceTokenManager.getToken(),
      refreshAccessToken: () => serviceTokenManager.getToken(),
    },
  });
}

/**
 * Returns the shared API client instance.
 * Throws if not yet initialized via initializeApiClient().
 */
export function getApiClient(): ApiClient {
  if (!_apiClient) {
    throw new Error(
      'API client not initialized. Call initializeApiClient() during boot.'
    );
  }
  return _apiClient;
}
