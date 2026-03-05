import { createApiClient } from '@iexcel/api-client';
import type { ApiClient } from '@iexcel/api-client';
import { createCookieTokenProvider } from '@/auth/api-token-provider';

/**
 * Creates an ApiClient configured for server-side use.
 *
 * Uses the cookie-based token provider so it works in Server Components,
 * Server Actions, and Route Handlers.
 */
export function getApiClient(): ApiClient {
  return createApiClient({
    baseUrl: process.env.API_BASE_URL ?? '',
    tokenProvider: createCookieTokenProvider(),
  });
}
