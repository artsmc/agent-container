import { NextResponse } from 'next/server'
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_EXPIRES_AT,
} from '@/auth/cookies'

/**
 * POST /auth/logout
 *
 * Clears all auth cookies and redirects the user to the login page.
 *
 * Accepts POST only — this protects against CSRF since SameSite=Lax cookies
 * are not sent on cross-site form submissions using methods other than GET.
 *
 * Note on RP-initiated logout: if the auth service (feature 05) implements
 * the RP-initiated logout endpoint, uncomment the block below and redirect
 * the user through the auth service logout URL first. Until then, local
 * cookie clearing is sufficient.
 */
export async function POST() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const loginUrl = new URL('/login', appUrl || 'http://localhost:3000')

  const response = NextResponse.redirect(loginUrl)

  // Clear all auth cookies by setting maxAge: 0
  const clearOptions = { maxAge: 0, path: '/' }
  response.cookies.set(COOKIE_ACCESS_TOKEN, '', clearOptions)
  response.cookies.set(COOKIE_REFRESH_TOKEN, '', clearOptions)
  response.cookies.set(COOKIE_EXPIRES_AT, '', clearOptions)

  // Optional: RP-initiated logout through the auth service.
  // Uncomment when feature 05 implements the /logout endpoint:
  //
  // const authIssuer = process.env.AUTH_ISSUER_URL
  // if (authIssuer) {
  //   const logoutUrl = new URL(`${authIssuer}/logout`)
  //   logoutUrl.searchParams.set('post_logout_redirect_uri', `${appUrl}/login`)
  //   logoutUrl.searchParams.set('client_id', 'iexcel-ui')
  //   return NextResponse.redirect(logoutUrl)
  // }

  return response
}
