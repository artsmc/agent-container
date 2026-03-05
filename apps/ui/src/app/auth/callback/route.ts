import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCodeForTokens } from '@iexcel/auth-client/auth-code'
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_EXPIRES_AT,
  COOKIE_PKCE,
  COOKIE_REDIRECT,
  SECURE_COOKIE_BASE,
  REFRESH_TOKEN_MAX_AGE,
} from '@/auth/cookies'

/**
 * GET /auth/callback
 *
 * Handles the OIDC authorization code callback from the auth service.
 *
 * Flow:
 * 1. Check for an error parameter from the provider.
 * 2. Validate the PKCE cookie is present and parseable.
 * 3. Validate state to protect against CSRF.
 * 4. Exchange the authorization code for tokens (back-channel call).
 * 5. Set httpOnly token cookies on the response.
 * 6. Clear single-use cookies (PKCE, redirect path).
 * 7. Redirect the user to their originally requested path or /.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const issuerUrl = process.env.AUTH_ISSUER_URL ?? ''

  // Step 1: Check for a provider-side error before anything else
  const providerError = searchParams.get('error')
  if (providerError !== null) {
    const description =
      searchParams.get('error_description') ?? 'Authentication failed'
    console.warn('[auth/callback] Provider returned error:', providerError)
    return NextResponse.redirect(
      new URL(`/auth/error?message=${encodeURIComponent(description)}`, request.url)
    )
  }

  const code = searchParams.get('code')
  const returnedState = searchParams.get('state')

  // Step 2: Validate the PKCE cookie is present
  const cookieStore = await cookies()
  const pkceRaw = cookieStore.get(COOKIE_PKCE)?.value

  if (!pkceRaw || !code || !returnedState) {
    console.warn('[auth/callback] Missing PKCE cookie, code, or state parameter')
    return NextResponse.redirect(
      new URL('/auth/error?message=Login+session+expired', request.url),
      { status: 400 }
    )
  }

  // Step 3: Parse the PKCE cookie and validate state (CSRF protection)
  let storedState: string
  let codeVerifier: string
  try {
    const parsed = JSON.parse(pkceRaw) as { state: string; codeVerifier: string }
    storedState = parsed.state
    codeVerifier = parsed.codeVerifier
  } catch {
    console.warn('[auth/callback] Failed to parse PKCE cookie')
    return NextResponse.redirect(
      new URL('/auth/error?message=Login+session+invalid', request.url),
      { status: 400 }
    )
  }

  if (returnedState !== storedState) {
    console.warn('[auth/callback] State mismatch — possible CSRF attempt')
    return NextResponse.redirect(
      new URL('/auth/error?message=Login+session+expired+or+invalid', request.url),
      { status: 400 }
    )
  }

  // Step 4: Exchange the authorization code for tokens (back-channel)
  let accessToken: string
  let refreshToken: string | undefined
  let expiresIn: number
  let expiresAt: number

  try {
    const tokenSet = await exchangeCodeForTokens(
      {
        issuerUrl,
        clientId: 'iexcel-ui',
        redirectUri: `${appUrl}/auth/callback`,
        scope: 'openid profile email',
      },
      request.url,
      storedState,
      codeVerifier
    )
    accessToken = tokenSet.accessToken
    refreshToken = tokenSet.refreshToken
    expiresIn = tokenSet.expiresIn ?? 3600
    expiresAt = tokenSet.expiresAt ?? Math.floor(Date.now() / 1000) + expiresIn
  } catch (err) {
    console.error('[auth/callback] Token exchange failed:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(
      new URL('/auth/error?message=Authentication+failed', request.url)
    )
  }

  // Step 5 & 7: Set token cookies and redirect to the originally requested path
  const redirectPath = cookieStore.get(COOKIE_REDIRECT)?.value ?? '/'
  // Prevent open redirect — only use path portion, not external URLs
  const safeRedirectPath = redirectPath.startsWith('/') ? redirectPath : '/'
  const response = NextResponse.redirect(new URL(safeRedirectPath, request.url))

  // Set httpOnly auth cookies
  response.cookies.set(COOKIE_ACCESS_TOKEN, accessToken, {
    ...SECURE_COOKIE_BASE,
    maxAge: expiresIn,
  })
  response.cookies.set(COOKIE_REFRESH_TOKEN, refreshToken ?? '', {
    ...SECURE_COOKIE_BASE,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  })
  response.cookies.set(COOKIE_EXPIRES_AT, String(expiresAt), {
    ...SECURE_COOKIE_BASE,
    maxAge: expiresIn,
  })

  // Step 6: Clear single-use cookies
  response.cookies.set(COOKIE_PKCE, '', { maxAge: 0, path: '/' })
  response.cookies.set(COOKIE_REDIRECT, '', { maxAge: 0, path: '/' })

  return response
}
