'use server'

import { cookies } from 'next/headers'
import { COOKIE_ACCESS_TOKEN } from '@/auth/cookies'

/**
 * Server Action that reads the access token from the httpOnly cookie.
 *
 * Used by the browser-side ApiClient to attach the Bearer token to
 * outgoing requests. The cookie is httpOnly and inaccessible to
 * client-side JavaScript, so this server action acts as a secure bridge.
 */
export async function getAccessTokenAction(): Promise<string> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_ACCESS_TOKEN)?.value ?? ''
}
