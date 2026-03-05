import { cookies } from 'next/headers'
import type { TokenProvider } from '@iexcel/api-client'
import { COOKIE_ACCESS_TOKEN } from './cookies'

/**
 * Reads the access token from the httpOnly session cookie.
 *
 * This function is only safe to call from Server Components, Server Actions,
 * and Route Handlers — contexts where `next/headers` cookies() is available.
 *
 * @throws {Error} if the access token cookie is absent.
 */
export async function getAccessToken(): Promise<string> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_ACCESS_TOKEN)
  if (!token?.value) {
    throw new Error('No access token available — user is not authenticated')
  }
  return token.value
}

/**
 * Creates a TokenProvider implementation that reads access tokens from the
 * httpOnly session cookie. Used to configure @iexcel/api-client in Server
 * Component contexts.
 *
 * The refresh path re-reads the cookie; actual token refresh is handled by
 * the proxy before the Server Component renders, so this path should rarely
 * be exercised.
 */
export function createCookieTokenProvider(): TokenProvider {
  return {
    getAccessToken,
    refreshAccessToken: getAccessToken,
  }
}
