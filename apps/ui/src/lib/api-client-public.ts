import { createApiClient } from '@iexcel/api-client';

/**
 * Creates an API client instance for public (unauthenticated) server-side calls.
 *
 * Used by the shared agenda page and other public routes that do not
 * require auth headers. The tokenProvider methods are no-ops since
 * public endpoints use skipAuth: true in the api-client transport.
 */
export function createPublicApiClient() {
  return createApiClient({
    baseUrl: process.env.API_BASE_URL ?? '',
    tokenProvider: {
      getAccessToken: () => Promise.resolve(''),
      refreshAccessToken: () => Promise.resolve(''),
    },
  });
}
