/**
 * Cookie name constants and base configuration for auth cookies.
 *
 * This is the single source of truth for cookie names across the application.
 * Import these constants in Route Handlers, Server Actions, and the proxy.
 */

export const COOKIE_ACCESS_TOKEN = 'iexcel_access_token' as const
export const COOKIE_REFRESH_TOKEN = 'iexcel_refresh_token' as const
export const COOKIE_EXPIRES_AT = 'iexcel_token_expires_at' as const
export const COOKIE_PKCE = 'iexcel_pkce' as const
export const COOKIE_REDIRECT = 'iexcel_redirect_after_login' as const

/**
 * Base cookie options for all auth token cookies.
 * `secure` is environment-aware: true in production, false in local development
 * so that http://localhost works without HTTPS.
 */
export const SECURE_COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const

/** Refresh token lifetime in seconds: 30 days. */
export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30

/** PKCE and redirect-after-login cookie lifetime in seconds: 5 minutes. */
export const SHORT_LIVED_COOKIE_MAX_AGE = 60 * 5
