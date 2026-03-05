/**
 * Auth Guard Proxy — Next.js 16 (was middleware.ts in Next.js ≤15)
 *
 * Intercepts all protected routes and:
 * 1. Redirects unauthenticated requests to /login, preserving the original path.
 * 2. Proactively refreshes access tokens that are within 60 seconds of expiry.
 * 3. Forwards the authenticated user's sub claim via x-user-sub header.
 *
 * Excluded from interception: /login, /auth/*, /shared/*, /_next/*, static assets.
 *
 * Runs on the Node.js runtime (default in Next.js 15.5+).
 * Do NOT set `export const runtime` — it is not valid in proxy.ts.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decodeSubFromJwt, isNearExpiry, silentRefresh } from '@/auth/token-utils'
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_EXPIRES_AT,
  COOKIE_REDIRECT,
  SECURE_COOKIE_BASE,
  SHORT_LIVED_COOKIE_MAX_AGE,
} from '@/auth/cookies'

// ---------------------------------------------------------------------------
// Proxy function (exported as `proxy`, not `middleware`)
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value
  const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value
  const expiresAtRaw = request.cookies.get(COOKIE_EXPIRES_AT)?.value

  // No session — redirect to /login, preserving the requested path
  if (!accessToken) {
    return redirectToLoginWithPath(request, pathname)
  }

  // Check whether the access token is near expiry
  const expiresAtSeconds = expiresAtRaw ? parseInt(expiresAtRaw, 10) : 0

  if (isNearExpiry(expiresAtSeconds)) {
    if (!refreshToken) {
      return clearCookiesAndRedirect(request)
    }
    try {
      const newTokens = await silentRefresh(refreshToken)
      const forwardedHeaders = buildForwardedHeaders(request, newTokens.accessToken)
      const response = NextResponse.next({ request: { headers: forwardedHeaders } })
      setTokenCookies(response, newTokens.accessToken, newTokens.refreshToken, newTokens.expiresAt)
      return response
    } catch (err) {
      console.error('[proxy] Silent refresh failed:', err instanceof Error ? err.message : err)
      return clearCookiesAndRedirect(request)
    }
  }

  // Token is valid — forward the request with the user sub header
  const sub = decodeSubFromJwt(accessToken)
  const forwardedHeaders = buildForwardedHeaders(request, accessToken, sub)
  return NextResponse.next({ request: { headers: forwardedHeaders } })
}

// ---------------------------------------------------------------------------
// Matcher config
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - /login              — login page (public)
     *   - /auth/*             — callback, logout, error pages
     *   - /shared/*           — client-facing public agenda views (PublicLayout)
     *   - /_next/static/*     — Next.js static asset chunks
     *   - /_next/image/*      — Next.js image optimisation endpoint
     *   - /favicon.ico        — browser favicon
     *   - /robots.txt         — crawl directive
     *   - /sitemap.xml        — SEO sitemap
     */
    '/((?!login|auth|shared|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function redirectToLoginWithPath(request: NextRequest, returnPath: string): NextResponse {
  const loginUrl = new URL('/login', request.url)
  const response = NextResponse.redirect(loginUrl)
  response.cookies.set(COOKIE_REDIRECT, returnPath, {
    httpOnly: false,
    sameSite: 'lax',
    secure: SECURE_COOKIE_BASE.secure,
    path: '/',
    maxAge: SHORT_LIVED_COOKIE_MAX_AGE,
  })
  return response
}

function clearCookiesAndRedirect(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL('/login', request.url))
  response.cookies.set(COOKIE_ACCESS_TOKEN, '', { maxAge: 0, path: '/' })
  response.cookies.set(COOKIE_REFRESH_TOKEN, '', { maxAge: 0, path: '/' })
  response.cookies.set(COOKIE_EXPIRES_AT, '', { maxAge: 0, path: '/' })
  return response
}

function buildForwardedHeaders(
  request: NextRequest,
  accessToken: string,
  sub?: string
): Headers {
  const headers = new Headers(request.headers)
  if (sub !== undefined) {
    headers.set('x-user-sub', sub)
  } else {
    headers.set('x-user-sub', decodeSubFromJwt(accessToken))
  }
  return headers
}

function setTokenCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): void {
  const expiresIn = expiresAt - Math.floor(Date.now() / 1000)

  response.cookies.set(COOKIE_ACCESS_TOKEN, accessToken, {
    ...SECURE_COOKIE_BASE,
    maxAge: expiresIn > 0 ? expiresIn : 0,
  })
  response.cookies.set(COOKIE_REFRESH_TOKEN, refreshToken, {
    ...SECURE_COOKIE_BASE,
    maxAge: 60 * 60 * 24 * 30,
  })
  response.cookies.set(COOKIE_EXPIRES_AT, String(expiresAt), {
    ...SECURE_COOKIE_BASE,
    maxAge: expiresIn > 0 ? expiresIn : 0,
  })
}
