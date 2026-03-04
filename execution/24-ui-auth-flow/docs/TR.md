# TR — Technical Requirements
## Feature 24: UI Auth Flow
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Technology Stack

| Concern | Technology | Version / Notes |
|---|---|---|
| Framework | Next.js | 16.x (App Router) |
| Language | TypeScript | 5.1+ strict mode |
| Auth library | `@iexcel/auth-client` | Nx monorepo package (feature 06) |
| API client | `@iexcel/api-client` | Nx monorepo package (feature 22) |
| OIDC primitives | `jose` | ^5.x (via auth-client) — not imported directly |
| Cookie access | `next/headers` `cookies()` | Async API (Next.js 15+) |
| Proxy / Middleware | `proxy.ts` | Next.js 16 rename of `middleware.ts`. Node.js runtime (stable since 15.5). |
| Styling | SCSS modules + `@iexcel/ui-tokens` | No new component styles in this feature beyond `/login` and `/auth/error` pages |

**Important Next.js 16 API changes affecting this feature:**
- `middleware.ts` is renamed to `proxy.ts`. The exported function name changes from `middleware` to `proxy`. The codemod `npx @next/codemod@canary middleware-to-proxy .` handles this migration if upgrading from an earlier scaffold.
- `cookies()` from `next/headers` is `async` — must use `await`.
- Proxy defaults to the Node.js runtime (as of 15.5, stable). The `runtime` config option is NOT available in `proxy.ts` — do not set it.

---

## 2. File Structure

The following files are added to the existing `apps/ui` scaffold from feature 23:

```
apps/ui/
├── proxy.ts                              # Auth guard proxy (Next.js 16 — was middleware.ts)
└── src/
    ├── app/
    │   ├── login/
    │   │   └── page.tsx                  # Login page — unauthenticated, PublicLayout
    │   ├── auth/
    │   │   ├── callback/
    │   │   │   └── route.ts              # GET /auth/callback — OIDC callback handler
    │   │   ├── logout/
    │   │   │   └── route.ts              # POST /auth/logout — logout handler
    │   │   └── error/
    │   │       └── page.tsx              # /auth/error — auth error display page
    │   └── (dashboard)/
    │       └── layout.tsx                # Updated: wraps children in AuthProvider, calls /me
    ├── auth/
    │   ├── AuthProvider.tsx              # AuthProvider + useAuth hook (client component)
    │   ├── types.ts                      # AuthenticatedUser interface
    │   ├── cookies.ts                    # Server-side cookie read/write helpers
    │   ├── token-utils.ts               # JWT payload decode (no verification), expiry check
    │   └── api-token-provider.ts        # Token provider function for @iexcel/api-client
    └── components/
        └── Sidebar/
            └── Sidebar.tsx               # Updated: add Logout form button
```

No new SCSS files are required beyond minimal styles for the login and error pages. These pages reuse `PublicLayout` and existing token variables.

---

## 3. Proxy Configuration (`proxy.ts`)

### 3.1 File Location

`proxy.ts` lives at `apps/ui/proxy.ts` (same level as `next.config.ts` and `package.json`). If a `src/` directory is used as the root in `next.config.ts`, it can also live at `apps/ui/src/proxy.ts`. Follow the pattern established in feature 23.

### 3.2 Implementation

```typescript
// apps/ui/proxy.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { silentRefresh } from '@/auth/token-utils'

const COOKIE_ACCESS_TOKEN = 'iexcel_access_token'
const COOKIE_REFRESH_TOKEN = 'iexcel_refresh_token'
const COOKIE_EXPIRES_AT = 'iexcel_token_expires_at'
const COOKIE_REDIRECT_AFTER_LOGIN = 'iexcel_redirect_after_login'

const SILENT_REFRESH_WINDOW_SECONDS = 60

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Read auth cookies
  const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value
  const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value
  const expiresAt = request.cookies.get(COOKIE_EXPIRES_AT)?.value

  // 2. No session — redirect to login
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.set(COOKIE_REDIRECT_AFTER_LOGIN, pathname, {
      httpOnly: false,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 300, // 5 minutes
    })
    return response
  }

  // 3. Check if token is near expiry
  const nowSeconds = Math.floor(Date.now() / 1000)
  const expiresAtSeconds = expiresAt ? parseInt(expiresAt, 10) : 0
  const isNearExpiry = expiresAtSeconds - nowSeconds < SILENT_REFRESH_WINDOW_SECONDS

  if (isNearExpiry) {
    if (!refreshToken) {
      return redirectToLogin(request)
    }
    try {
      const newTokens = await silentRefresh(refreshToken)
      const response = NextResponse.next({
        request: {
          headers: new Headers({
            ...Object.fromEntries(request.headers),
            'x-user-sub': decodeSubFromJwt(newTokens.access_token),
          }),
        },
      })
      setAuthCookies(response, newTokens)
      return response
    } catch {
      return redirectToLogin(request)
    }
  }

  // 4. Token is valid — forward with user sub header
  const sub = decodeSubFromJwt(accessToken)
  const response = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(request.headers),
        'x-user-sub': sub,
      }),
    },
  })
  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - /login        — login page (public)
     * - /auth/*       — callback, logout, error pages
     * - /shared/*     — client-facing public agenda views
     * - /_next/*      — Next.js internal assets
     * - /favicon.ico, /robots.txt, /sitemap.xml
     */
    '/((?!login|auth|shared|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}

function redirectToLogin(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL('/login', request.url))
  response.cookies.set(COOKIE_ACCESS_TOKEN, '', { maxAge: 0 })
  response.cookies.set(COOKIE_REFRESH_TOKEN, '', { maxAge: 0 })
  response.cookies.set(COOKIE_EXPIRES_AT, '', { maxAge: 0 })
  return response
}
```

### 3.3 `decodeSubFromJwt` (proxy-safe, no verification)

```typescript
// Extracts the sub claim from a JWT without signature verification.
// Signature verification is handled by the auth service.
// This is safe because: (a) the cookie is httpOnly so it can't be tampered
// with by client JS, and (b) the API validates the token on every call.
function decodeSubFromJwt(jwt: string): string {
  try {
    const [, payload] = jwt.split('.')
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8')
    )
    return typeof decoded.sub === 'string' ? decoded.sub : ''
  } catch {
    return ''
  }
}
```

### 3.4 `silentRefresh` (server-side fetch in proxy)

```typescript
// apps/ui/src/auth/token-utils.ts

import { refreshAccessToken } from '@iexcel/auth-client/refresh'

const AUTH_ISSUER_URL = process.env.AUTH_ISSUER_URL!

export interface RefreshedTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
}

export async function silentRefresh(refreshToken: string): Promise<RefreshedTokens> {
  // refreshAccessToken is from @iexcel/auth-client
  // It POSTs to {issuerUrl}/token with refresh_token grant
  const tokenSet = await refreshAccessToken({
    issuerUrl: AUTH_ISSUER_URL,
    clientId: 'iexcel-ui',
    refreshToken,
  })
  return {
    access_token: tokenSet.access_token,
    refresh_token: tokenSet.refresh_token,
    expires_in: tokenSet.expires_in,
  }
}
```

---

## 4. Route Handlers

### 4.1 `GET /auth/callback` — Authorization Code Exchange

**File:** `apps/ui/src/app/auth/callback/route.ts`

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCodeForTokens } from '@iexcel/auth-client/auth-code'

const COOKIE_PKCE = 'iexcel_pkce'
const COOKIE_ACCESS_TOKEN = 'iexcel_access_token'
const COOKIE_REFRESH_TOKEN = 'iexcel_refresh_token'
const COOKIE_EXPIRES_AT = 'iexcel_token_expires_at'
const COOKIE_REDIRECT = 'iexcel_redirect_after_login'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  // Check for provider error
  const error = searchParams.get('error')
  if (error) {
    const desc = searchParams.get('error_description') ?? 'Authentication failed'
    return NextResponse.redirect(
      new URL(`/auth/error?message=${encodeURIComponent(desc)}`, request.url)
    )
  }

  const code = searchParams.get('code')
  const returnedState = searchParams.get('state')

  const cookieStore = await cookies()
  const pkceRaw = cookieStore.get(COOKIE_PKCE)?.value

  // Validate PKCE cookie exists
  if (!pkceRaw || !code || !returnedState) {
    return NextResponse.redirect(
      new URL('/auth/error?message=Login+session+expired', request.url),
      { status: 400 }
    )
  }

  let storedState: string
  let codeVerifier: string
  try {
    const parsed = JSON.parse(pkceRaw) as { state: string; codeVerifier: string }
    storedState = parsed.state
    codeVerifier = parsed.codeVerifier
  } catch {
    return NextResponse.redirect(
      new URL('/auth/error?message=Login+session+invalid', request.url),
      { status: 400 }
    )
  }

  // State validation (CSRF protection)
  if (returnedState !== storedState) {
    console.warn('[auth/callback] State mismatch — possible CSRF attempt')
    return NextResponse.redirect(
      new URL('/auth/error?message=Login+session+expired+or+invalid', request.url),
      { status: 400 }
    )
  }

  // Token exchange
  let tokenSet: Awaited<ReturnType<typeof exchangeCodeForTokens>>
  try {
    tokenSet = await exchangeCodeForTokens({
      issuerUrl: process.env.AUTH_ISSUER_URL!,
      clientId: 'iexcel-ui',
      code,
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      codeVerifier,
    })
  } catch (err) {
    console.error('[auth/callback] Token exchange failed:', err)
    return NextResponse.redirect(
      new URL('/auth/error?message=Authentication+failed', request.url)
    )
  }

  // Determine redirect destination
  const redirectTo = cookieStore.get(COOKIE_REDIRECT)?.value ?? '/'

  // Build response with auth cookies
  const response = NextResponse.redirect(new URL(redirectTo, request.url))

  const nowSeconds = Math.floor(Date.now() / 1000)
  const expiresAt = nowSeconds + tokenSet.expires_in

  const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: true, path: '/' }

  response.cookies.set(COOKIE_ACCESS_TOKEN, tokenSet.access_token, {
    ...cookieBase,
    maxAge: tokenSet.expires_in,
  })
  response.cookies.set(COOKIE_REFRESH_TOKEN, tokenSet.refresh_token ?? '', {
    ...cookieBase,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  response.cookies.set(COOKIE_EXPIRES_AT, String(expiresAt), {
    ...cookieBase,
    maxAge: tokenSet.expires_in,
  })

  // Clear single-use cookies
  response.cookies.set(COOKIE_PKCE, '', { maxAge: 0 })
  response.cookies.set(COOKIE_REDIRECT, '', { maxAge: 0 })

  return response
}
```

### 4.2 `POST /auth/logout` — Logout Handler

**File:** `apps/ui/src/app/auth/logout/route.ts`

```typescript
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(_request: NextRequest) {
  const response = NextResponse.redirect(
    new URL('/login', process.env.NEXT_PUBLIC_APP_URL!)
  )

  // Clear all auth cookies
  const cookieBase = { maxAge: 0, path: '/' }
  response.cookies.set('iexcel_access_token', '', cookieBase)
  response.cookies.set('iexcel_refresh_token', '', cookieBase)
  response.cookies.set('iexcel_token_expires_at', '', cookieBase)

  // Optional: redirect through auth service RP-initiated logout first.
  // Uncomment if the auth service (feature 05) implements RP-initiated logout.
  // const logoutUrl = new URL(`${process.env.AUTH_ISSUER_URL}/logout`)
  // logoutUrl.searchParams.set('post_logout_redirect_uri', `${process.env.NEXT_PUBLIC_APP_URL}/login`)
  // logoutUrl.searchParams.set('client_id', 'iexcel-ui')
  // return NextResponse.redirect(logoutUrl)

  return response
}
```

---

## 5. Login Page

**File:** `apps/ui/src/app/login/page.tsx`

```typescript
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { buildAuthorizeUrl, generatePkceChallenge } from '@iexcel/auth-client/auth-code'
import { generateState } from '@/auth/token-utils'
import LoginButton from './LoginButton'

export const metadata: Metadata = { title: 'Login — iExcel' }

export default async function LoginPage() {
  // Already authenticated — redirect to dashboard
  const cookieStore = await cookies()
  if (cookieStore.has('iexcel_access_token')) {
    redirect('/')
  }

  // Pre-generate PKCE and state for the login button action
  // The actual redirect happens in the LoginButton Server Action
  return (
    <main>
      <h1>iExcel</h1>
      <LoginButton />
    </main>
  )
}
```

**File:** `apps/ui/src/app/login/LoginButton.tsx`

```typescript
'use client'

import { startLogin } from './actions'

export default function LoginButton() {
  return (
    <form action={startLogin}>
      <button type="submit">Login with SSO</button>
    </form>
  )
}
```

**File:** `apps/ui/src/app/login/actions.ts`

```typescript
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { buildAuthorizeUrl, generatePkceChallenge } from '@iexcel/auth-client/auth-code'
import { generateState } from '@/auth/token-utils'

export async function startLogin() {
  const { codeVerifier, codeChallenge } = await generatePkceChallenge()
  const state = generateState()

  const cookieStore = await cookies()
  cookieStore.set('iexcel_pkce', JSON.stringify({ state, codeVerifier }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 300, // 5 minutes — enough time to complete the IdP redirect
    path: '/',
  })

  const authorizeUrl = buildAuthorizeUrl({
    issuerUrl: process.env.AUTH_ISSUER_URL!,
    clientId: 'iexcel-ui',
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    scopes: ['openid', 'profile', 'email'],
    state,
    codeChallenge,
    codeChallengeMethod: 'S256',
  })

  redirect(authorizeUrl)
}
```

---

## 6. AuthProvider and useAuth Hook

**File:** `apps/ui/src/auth/types.ts`

```typescript
export interface AuthenticatedUser {
  sub: string
  email: string
  name: string
  role: 'admin' | 'account_manager' | 'team_member'
  assignedClientIds: string[]
}
```

**File:** `apps/ui/src/auth/AuthProvider.tsx`

```typescript
'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { AuthenticatedUser } from './types'

interface AuthContextValue {
  user: AuthenticatedUser
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  user: AuthenticatedUser
  children: ReactNode
}

export function AuthProvider({ user, children }: AuthProviderProps) {
  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
```

---

## 7. Dashboard Layout Update

**File:** `apps/ui/src/app/(dashboard)/layout.tsx`

```typescript
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthProvider } from '@/auth/AuthProvider'
import type { AuthenticatedUser } from '@/auth/types'
import { decodeJwtPayload } from '@/auth/token-utils'
import { createApiClient } from '@iexcel/api-client'
import DashboardLayout from '@/layouts/DashboardLayout'

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('iexcel_access_token')?.value

  if (!accessToken) {
    redirect('/login')
  }

  // Decode identity claims from token (no re-verification — proxy already validated)
  const claims = decodeJwtPayload(accessToken)
  if (!claims?.sub || !claims.email || !claims.name) {
    redirect('/login')
  }

  // Fetch product-level permissions from /me
  let role: AuthenticatedUser['role']
  let assignedClientIds: string[]
  try {
    const apiClient = createApiClient({
      baseUrl: process.env.API_BASE_URL!,
      tokenProvider: async () => accessToken,
    })
    const me = await apiClient.getMe()
    role = me.role
    assignedClientIds = me.assignedClientIds
  } catch (err) {
    console.error('[dashboard/layout] /me call failed:', err)
    redirect('/login')
  }

  const user: AuthenticatedUser = {
    sub: claims.sub as string,
    email: claims.email as string,
    name: claims.name as string,
    role,
    assignedClientIds,
  }

  return (
    <AuthProvider user={user}>
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </AuthProvider>
  )
}
```

---

## 8. Cookie Helpers

**File:** `apps/ui/src/auth/cookies.ts`

Constants and helper types used across Route Handlers and Server Components.

```typescript
// Cookie name constants — single source of truth
export const COOKIE_ACCESS_TOKEN = 'iexcel_access_token' as const
export const COOKIE_REFRESH_TOKEN = 'iexcel_refresh_token' as const
export const COOKIE_EXPIRES_AT = 'iexcel_token_expires_at' as const
export const COOKIE_PKCE = 'iexcel_pkce' as const
export const COOKIE_REDIRECT = 'iexcel_redirect_after_login' as const

export const SECURE_COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: true,
  path: '/',
} as const

export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30 // 30 days in seconds
```

---

## 9. Token Utilities

**File:** `apps/ui/src/auth/token-utils.ts`

```typescript
import { webcrypto } from 'crypto'

/**
 * Decode JWT payload without signature verification.
 * Used in proxy.ts and dashboard layout — not for security-critical decisions.
 * The auth service performs full signature verification.
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const [, payload] = jwt.split('.')
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'))
  } catch {
    return null
  }
}

/**
 * Generate a cryptographically random state parameter.
 * 32 bytes → base64url → 43-character string.
 */
export function generateState(): string {
  const bytes = webcrypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(bytes).toString('base64url')
}

/**
 * Determine if the access token is within the silent refresh window.
 */
export function isNearExpiry(
  expiresAtSeconds: number,
  windowSeconds = 60
): boolean {
  return expiresAtSeconds - Math.floor(Date.now() / 1000) < windowSeconds
}
```

---

## 10. Environment Variables

**File:** `apps/ui/.env.local` (local development only — not committed)

```
# Auth service OIDC issuer — server-side only
AUTH_ISSUER_URL=https://auth.iexcel.com

# UI's own public URL — available in browser + server
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Product API base URL — server-side only
API_BASE_URL=http://localhost:4000
```

**Deployment environment variables** (set via Terraform / CI):

| Variable | Example Value | Scope |
|---|---|---|
| `AUTH_ISSUER_URL` | `https://auth.iexcel.com` | Server-only |
| `NEXT_PUBLIC_APP_URL` | `https://app.iexcel.com` | Public |
| `API_BASE_URL` | `https://api.iexcel.com` | Server-only |

No client secrets are stored. The `iexcel-ui` client is public.

---

## 11. External API Contracts

### 11.1 Auth Service — Token Exchange

**Endpoint:** `POST {AUTH_ISSUER_URL}/token`

Request (form-encoded):
```
grant_type=authorization_code
&code={authorization_code}
&redirect_uri={NEXT_PUBLIC_APP_URL}/auth/callback
&client_id=iexcel-ui
&code_verifier={pkce_code_verifier}
```

Response (200 OK):
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "dGhpcyBp...",
  "id_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Error response (400):
```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code expired"
}
```

### 11.2 Auth Service — Token Refresh

**Endpoint:** `POST {AUTH_ISSUER_URL}/token`

Request (form-encoded):
```
grant_type=refresh_token
&refresh_token={refresh_token}
&client_id=iexcel-ui
```

Response (200 OK) — same shape as token exchange response. May include a new `refresh_token` if rotation is enabled.

### 11.3 Product API — Current User

**Endpoint:** `GET {API_BASE_URL}/me`

Request headers:
```
Authorization: Bearer {access_token}
```

Response (200 OK):
```json
{
  "role": "account_manager",
  "assignedClientIds": ["client-uuid-1", "client-uuid-2"]
}
```

Response (401 Unauthorized):
```json
{ "error": "Unauthorized" }
```

The dashboard layout redirects to `/login` on any non-200 response.

### 11.4 Auth Service — Authorization Endpoint

**Endpoint:** `GET {AUTH_ISSUER_URL}/authorize`

Query parameters:
| Parameter | Value |
|---|---|
| `client_id` | `iexcel-ui` |
| `redirect_uri` | `{NEXT_PUBLIC_APP_URL}/auth/callback` |
| `response_type` | `code` |
| `scope` | `openid profile email` |
| `state` | `{random 32-byte base64url}` |
| `code_challenge` | `{SHA-256 of code_verifier, base64url}` |
| `code_challenge_method` | `S256` |

---

## 12. Cookie Specification

| Cookie Name | httpOnly | SameSite | Secure | Path | maxAge | Contents |
|---|---|---|---|---|---|---|
| `iexcel_access_token` | true | Lax | true | / | `expires_in` (e.g. 3600s) | Raw JWT access token |
| `iexcel_refresh_token` | true | Lax | true | / | 2592000s (30 days) | Raw refresh token |
| `iexcel_token_expires_at` | true | Lax | true | / | `expires_in` | Unix timestamp (seconds) |
| `iexcel_pkce` | true | Lax | true | / | 300s (5 min) | JSON: `{state, codeVerifier}` |
| `iexcel_redirect_after_login` | false | Lax | true | / | 300s (5 min) | URL path string |

**Note on `iexcel_redirect_after_login`**: This cookie is NOT `httpOnly` to allow the callback handler (which runs as a Route Handler) to read it via `next/headers` `cookies()`. Since it contains only a URL path (not a secret), this is acceptable.

---

## 13. Dependencies

### 13.1 New npm Dependencies

No new runtime npm dependencies are introduced in this feature. All auth primitives come from `@iexcel/auth-client` (feature 06), which bundles `jose`. The `next/headers` and `next/server` APIs are already included with Next.js.

### 13.2 New Internal Nx Dependencies

| Package | Import Path | Usage |
|---|---|---|
| `@iexcel/auth-client` | `@iexcel/auth-client/auth-code` | `buildAuthorizeUrl`, `exchangeCodeForTokens`, `generatePkceChallenge` |
| `@iexcel/auth-client` | `@iexcel/auth-client/refresh` | `refreshAccessToken` (silent refresh) |
| `@iexcel/api-client` | `@iexcel/api-client` | `createApiClient` for `/me` call in dashboard layout |

Add to `apps/ui/project.json` implicit dependencies:
```json
"implicitDependencies": ["ui-tokens", "shared-types", "api-client", "auth-client"]
```

---

## 14. Security Considerations

| Threat | Mitigation |
|---|---|
| XSS stealing tokens | All token cookies are `httpOnly`. Tokens cannot be read by client-side JavaScript. |
| CSRF on token-using endpoints | Cookies are `SameSite=Lax`. The logout endpoint uses `POST` (not interceptable by simple CSRF). |
| Authorization code interception | PKCE with S256 required. Even if the code is intercepted, it is useless without the code verifier. |
| State parameter replay / CSRF | State validated against the `iexcel_pkce` cookie before token exchange. State is single-use (cookie cleared after callback). |
| Open redirect after login | The `iexcel_redirect_after_login` cookie stores a path only (not a full URL). Redirect target is constructed with `new URL(path, request.url)`, preventing external redirects. |
| Token leakage in logs | Token values never appear in `console.log` or error messages. Errors log only error codes/messages from the auth service. |
| PKCE cookie fixation | The `iexcel_pkce` cookie is cleared immediately after the callback handler reads it. It cannot be reused. |
| Proxy bypass via `_next/data` | Next.js 16 proxy still intercepts `_next/data` routes even when excluded from the matcher pattern. This is intentional platform behaviour — data routes are protected automatically. |
| Unauthenticated access to `/shared/*` | The proxy matcher explicitly excludes `/shared/*`. These routes use `PublicLayout` and never require auth cookies. |

---

## 15. Performance Considerations

| Concern | Approach |
|---|---|
| Proxy overhead per request | The proxy reads cookies (O(1) hash lookup) and checks a timestamp comparison. No database or network calls on the happy path (valid, non-expiring token). Sub-millisecond overhead. |
| Silent refresh network call | Only triggered within the 60-second window before expiry. For a 1-hour access token, this is at most once per hour per user. The proxy uses the Node.js runtime fetch — no Edge network restrictions. |
| `/me` API call on every dashboard page load | The call is made in the `(dashboard)/layout.tsx` Server Component. Next.js 16 Server Component caching applies — if the layout is cached (unlikely for auth-sensitive data), the call is not repeated. For now, accept one `/me` call per full page navigation. |
| `decodeJwtPayload` in proxy | Pure CPU — base64url decode + JSON.parse. No network. Negligible overhead. |
| Cookie size | The access token JWT is typically 300–500 bytes. The refresh token is an opaque string (100–200 bytes). Total cookie overhead is under 1KB — well within browser and HTTP header limits. |

---

## 16. Testing Strategy

### 16.1 Unit Tests

Use `vitest` consistent with the auth-client package pattern. HTTP calls mocked with `msw`.

| File | Key Test Cases |
|---|---|
| `token-utils.ts` | `decodeJwtPayload` — valid JWT, malformed, missing segments. `generateState` — output length, base64url charset. `isNearExpiry` — boundary conditions at exactly 60s, 61s, 59s. |
| `proxy.ts` | Use `unstable_doesProxyMatch` (Next.js 15.1+ experimental) to verify matcher includes/excludes correct paths. Test redirect behaviour with `getRedirectUrl` utility. |
| `auth/callback/route.ts` | State match success, state mismatch, missing PKCE cookie, provider error param, token exchange failure. |
| `auth/logout/route.ts` | Cookie clearing — all three cookies set to maxAge 0 in response. |
| `AuthProvider.tsx` | `useAuth` returns user when within provider. `useAuth` throws when outside provider. |

### 16.2 Integration Test (Manual / E2E)

With the auth service running (from feature 05):
1. Navigate to `/` → redirected to `/login`.
2. Click "Login with SSO" → redirected to auth service.
3. Complete authentication → redirected to `/auth/callback`.
4. Tokens set in cookies → redirected to dashboard.
5. Navigate away and back — no re-login.
6. Wait for token expiry window (or set a short `expires_in` in dev) → silent refresh occurs.
7. Click Logout → cookies cleared → redirected to `/login`.
8. Navigate to `/` → redirected to `/login` again.

### 16.3 Security Test (Manual)

- Open browser DevTools after login — confirm `iexcel_access_token` and `iexcel_refresh_token` do NOT appear in `document.cookie`.
- Attempt to navigate to `/auth/callback?code=fake&state=fake` directly — confirm `400` error (no PKCE cookie).
- Attempt to submit a cross-origin POST to `/auth/logout` — confirm `SameSite=Lax` prevents the request from carrying auth cookies.
- Navigate to `/shared/some-token` without authentication — confirm no redirect to `/login`.

---

## 17. Infrastructure Requirements

| Requirement | Detail |
|---|---|
| Container | `apps/ui` container (feature 35). No changes to Dockerfile from feature 23's baseline. |
| Environment variables | `AUTH_ISSUER_URL`, `NEXT_PUBLIC_APP_URL`, `API_BASE_URL` must be set in the container. Added to Terraform app deployment (feature 36). |
| HTTPS | Required in production — all auth cookies use `Secure: true`. Local development uses `http://localhost:3000` and `Secure: false` must be applied conditionally via `NODE_ENV=development` check. |
| Network access | The `apps/ui` container (specifically the proxy.ts and Route Handlers running server-side) must be able to reach `AUTH_ISSUER_URL` and `API_BASE_URL`. These are internal service-to-service calls within the cluster. |
| No new ports | Auth flow uses the existing port 3000 for the UI. |

### 17.1 Local Development HTTPS Note

In development (`NODE_ENV=development`), set `secure: false` on cookies to allow `http://localhost`:

```typescript
const isProduction = process.env.NODE_ENV === 'production'

const SECURE_COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/',
}
```

---

## 18. Open Technical Questions

| Question | Impact | Decision Needed By |
|---|---|---|
| Does the auth service (feature 05) implement RP-initiated logout (`/logout` endpoint)? | If yes, enable the redirect through the auth service in `/auth/logout`. If no, local cookie-clearing only. | Before task FR-09 implementation |
| Does the auth service implement refresh token rotation? | If yes, the proxy must update `iexcel_refresh_token` on every successful silent refresh. The current spec handles this in FR-08, but the auth-client `refreshAccessToken` must surface the new refresh token. | Confirm with feature 06 spec — the `TokenSet` interface includes `refresh_token?: string` |
| What signing algorithm does the auth service use (RS256 vs ES256)? | Affects key format in JWK — no direct impact on this feature since we don't verify signatures in the UI. Only relevant if full JWT verification is added here in future. | Low priority for this feature |
| Should `/me` response be cached in the dashboard layout? | If yes, use `unstable_cache` or route segment config `revalidate`. If the role changes mid-session, caching delays the update. Recommended: no caching for auth-sensitive data. | Before task FR-14 implementation |
| Should the proxy validate the JWT signature, not just decode the payload? | Validation requires JWKS fetch and adds latency. The current spec skips signature verification in the proxy and relies on the API to reject expired/invalid tokens. This is a valid tradeoff for performance. | Architecture review |
