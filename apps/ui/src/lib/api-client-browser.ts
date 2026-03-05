import { createApiClient } from '@iexcel/api-client'
import type { ApiClient } from '@iexcel/api-client'
import { getAccessTokenAction } from './get-token-action'

let instance: ApiClient | null = null

/**
 * Returns a singleton ApiClient configured for browser-side use.
 *
 * The TokenProvider delegates to a server action that reads the
 * httpOnly access token cookie. Tokens are cached in memory to
 * avoid a server action round-trip on every request; the cache is
 * invalidated automatically on 401 via refreshAccessToken.
 */
export function getBrowserApiClient(): ApiClient {
  if (instance) return instance

  let cachedToken: string | null = null

  instance = createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
    tokenProvider: {
      getAccessToken: async () => {
        if (!cachedToken) {
          cachedToken = await getAccessTokenAction()
        }
        return cachedToken
      },
      refreshAccessToken: async () => {
        cachedToken = null
        cachedToken = await getAccessTokenAction()
        return cachedToken
      },
    },
  })

  return instance
}
