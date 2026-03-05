/**
 * Creates a per-request, user-scoped API client instance.
 *
 * Each MCP tool invocation constructs a fresh API client using the
 * calling user's access token. This ensures:
 * - Token isolation between concurrent requests
 * - No cross-request token leakage
 * - User-scoped authorization enforcement at the API layer
 *
 * The service API client (created at startup) is NOT used for MCP tools.
 *
 * @see Feature 21 — FR-11, FR-12
 * @see Feature 18 — FR-43 (pattern established)
 */
import { createApiClient, type ApiClient } from '@iexcel/api-client';
import { env } from '../../config/env.js';

/**
 * Create a user-scoped API client for a single MCP tool invocation.
 *
 * @param userToken - The user's Bearer token extracted from the MCP request
 * @returns A fully configured ApiClient that authenticates as the user
 */
export function createUserApiClient(userToken: string): ApiClient {
  return createApiClient({
    baseUrl: env.API_BASE_URL,
    tokenProvider: {
      getAccessToken: async () => userToken,
      refreshAccessToken: async () => userToken,
    },
  });
}
