import { webcrypto } from 'node:crypto'
import { refreshAccessToken } from '@iexcel/auth-client/refresh'

// ---------------------------------------------------------------------------
// JWT decode utilities
// ---------------------------------------------------------------------------

/**
 * Decodes the payload section of a JWT without performing signature verification.
 *
 * This is safe in the UI context because:
 * 1. Token cookies are httpOnly — they cannot be tampered with by client JS.
 * 2. The API validates the token's signature on every authenticated request.
 *
 * Returns null if the JWT is malformed.
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    if (payload === undefined) return null
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as Record<
      string,
      unknown
    >
  } catch {
    return null
  }
}

/**
 * Extracts the `sub` claim from a JWT payload without signature verification.
 * Returns an empty string if the JWT is malformed or the claim is absent.
 */
export function decodeSubFromJwt(jwt: string): string {
  const payload = decodeJwtPayload(jwt)
  return typeof payload?.sub === 'string' ? payload.sub : ''
}

// ---------------------------------------------------------------------------
// State generation
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically random state parameter for PKCE OAuth flows.
 * Produces 32 random bytes encoded as base64url (43 characters).
 */
export function generateState(): string {
  const bytes = webcrypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(bytes).toString('base64url')
}

// ---------------------------------------------------------------------------
// Expiry helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the access token expires within the given window.
 * Used by the proxy to determine whether a proactive silent refresh is needed.
 *
 * @param expiresAtSeconds - Unix timestamp (seconds) when the token expires.
 * @param windowSeconds - How many seconds before expiry to trigger a refresh. Defaults to 60.
 */
export function isNearExpiry(expiresAtSeconds: number, windowSeconds = 60): boolean {
  return expiresAtSeconds - Math.floor(Date.now() / 1000) < windowSeconds
}

// ---------------------------------------------------------------------------
// Silent refresh
// ---------------------------------------------------------------------------

/** Shape of the refreshed token data returned by silentRefresh. */
export interface RefreshedTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  expiresAt: number
}

/**
 * Performs a back-channel silent token refresh using the refresh_token grant.
 * Called from proxy.ts when the access token is near expiry.
 *
 * @throws {TokenRefreshError} if the refresh token is expired, revoked, or the
 *   auth service is unreachable.
 */
export async function silentRefresh(refreshToken: string): Promise<RefreshedTokens> {
  const issuerUrl = process.env.AUTH_ISSUER_URL
  if (!issuerUrl) {
    throw new Error('AUTH_ISSUER_URL is not configured')
  }

  const tokenSet = await refreshAccessToken(
    {
      issuerUrl,
      clientId: 'iexcel-ui',
    },
    refreshToken
  )

  const nowSeconds = Math.floor(Date.now() / 1000)
  const expiresIn = tokenSet.expiresIn ?? 3600

  return {
    accessToken: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken ?? refreshToken,
    expiresIn,
    expiresAt: tokenSet.expiresAt ?? nowSeconds + expiresIn,
  }
}
