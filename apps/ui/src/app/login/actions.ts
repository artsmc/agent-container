'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { generatePkceChallenge, buildAuthorizeUrl } from '@iexcel/auth-client/auth-code'
import { generateState } from '@/auth/token-utils'
import { COOKIE_PKCE, SECURE_COOKIE_BASE, SHORT_LIVED_COOKIE_MAX_AGE } from '@/auth/cookies'

/**
 * Server Action: initiates the PKCE authorization code flow.
 *
 * 1. Generates a PKCE code verifier + challenge pair.
 * 2. Generates a cryptographically random state parameter.
 * 3. Stores both in an httpOnly cookie for the callback handler to retrieve.
 * 4. Redirects the browser to the auth service /authorize endpoint.
 *
 * This is a full browser-level HTTP redirect (not a client-side navigation),
 * which ensures no token values are exposed to JavaScript.
 */
export async function startLogin(): Promise<never> {
  const issuerUrl = process.env.AUTH_ISSUER_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!issuerUrl || !appUrl) {
    throw new Error(
      'Missing required environment variables: AUTH_ISSUER_URL and NEXT_PUBLIC_APP_URL must be set'
    )
  }

  const { codeVerifier, codeChallenge } = await generatePkceChallenge()
  const state = generateState()

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_PKCE, JSON.stringify({ state, codeVerifier }), {
    ...SECURE_COOKIE_BASE,
    maxAge: SHORT_LIVED_COOKIE_MAX_AGE,
  })

  const authorizeUrl = await buildAuthorizeUrl(
    {
      issuerUrl,
      clientId: 'iexcel-ui',
      redirectUri: `${appUrl}/auth/callback`,
      scope: 'openid profile email',
    },
    state,
    codeChallenge
  )

  redirect(authorizeUrl)
}
