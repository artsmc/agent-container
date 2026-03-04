# FRS — Functional Requirement Specification
## Feature 24: UI Auth Flow
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Login Flow

### FR-01: Login Entry Point

The application must provide a `/login` page that is accessible to unauthenticated users.

- The page renders a single "Login with SSO" button (or equivalent call-to-action).
- No username/password fields are shown. Authentication is entirely delegated to the external IdP via the auth service.
- The page applies `PublicLayout` (not `DashboardLayout`). It must never be intercepted by the auth proxy.
- If the user is already authenticated (valid session cookie present), visiting `/login` must redirect them to `/` (the dashboard).

### FR-02: Authorization Redirect

When the user clicks the login button, the application must:

1. Generate a PKCE code verifier and code challenge pair using `@iexcel/auth-client`'s `generatePkceChallenge()`.
2. Generate a cryptographically random `state` parameter (min 32 bytes, base64url encoded).
3. Store both the `codeVerifier` and `state` in a short-lived, `httpOnly`, `SameSite=Lax`, `Secure` cookie (e.g., `iexcel_pkce`) for use during the callback.
4. Redirect the browser to the auth service `/authorize` endpoint with parameters:
   - `client_id=iexcel-ui`
   - `redirect_uri={NEXT_PUBLIC_APP_URL}/auth/callback`
   - `response_type=code`
   - `scope=openid profile email`
   - `state={generated state}`
   - `code_challenge={generated challenge}`
   - `code_challenge_method=S256`

This redirect is a full browser navigation (HTTP 302), not a client-side fetch.

### FR-03: Callback Handler

A Route Handler at `GET /auth/callback` must:

1. Extract `code` and `state` query parameters from the incoming request.
2. If `error` parameter is present in the query string, render an error page showing the auth service's error description. Do not attempt token exchange.
3. Read the `iexcel_pkce` cookie to retrieve the stored `state` and `codeVerifier`.
4. Validate that the returned `state` matches the stored `state`. If they do not match, respond with a `400` error page (CSRF protection).
5. Exchange the authorization code for tokens by calling the auth service `/token` endpoint (back-channel, server-side) using `@iexcel/auth-client`'s `exchangeCodeForTokens()`:
   - `grant_type=authorization_code`
   - `code={code}`
   - `redirect_uri={same as in FR-02}`
   - `client_id=iexcel-ui`
   - `code_verifier={from cookie}`
6. On successful token exchange, set the following response cookies:
   - `iexcel_access_token` — the access token. `httpOnly`, `SameSite=Lax`, `Secure`, `Path=/`. `maxAge` set to `expires_in` seconds from the token response.
   - `iexcel_refresh_token` — the refresh token. `httpOnly`, `SameSite=Lax`, `Secure`, `Path=/`. `maxAge` set to the refresh token lifetime (30 days per auth-prd.md).
   - `iexcel_token_expires_at` — the expiry timestamp (Unix seconds) of the access token. `httpOnly`, `SameSite=Lax`, `Secure`. Used by the proxy to determine whether to refresh proactively.
7. Clear the `iexcel_pkce` cookie (it is single-use).
8. Redirect the user to the originally requested path (stored in the `iexcel_redirect_after_login` cookie if set by the proxy, otherwise `/`).

### FR-04: Callback Error States

| Condition | Behaviour |
|---|---|
| `error` parameter present in callback URL | Render `/auth/error` page with message from `error_description` parameter |
| State mismatch | Return `400` with a "Login session expired or invalid" error page |
| Token exchange fails (non-2xx from auth service) | Render `/auth/error` page with generic "Authentication failed" message. Do not expose raw auth service error to the user. Log the error server-side. |
| `iexcel_pkce` cookie missing | Return `400` — the PKCE cookie may have expired or the user navigated to the callback URL directly |

---

## 2. Protected Route Proxy (Auth Middleware)

### FR-05: Proxy Scope

The Next.js proxy (`proxy.ts`, formerly `middleware.ts` — renamed in Next.js 16) must intercept all requests matching:

```
/((?!_next/static|_next/image|favicon.ico|auth|shared|login).*)`
```

Explicitly excluded from proxy interception:
- `/auth/*` — the callback and error pages
- `/login` — the login page
- `/shared/*` — public client-facing routes (PublicLayout)
- `/_next/static/*`, `/_next/image/*` — Next.js internal assets
- `/favicon.ico`, `/robots.txt`, `/sitemap.xml` — static metadata

### FR-06: Session Validation in Proxy

For every intercepted request, the proxy must:

1. Check for the presence of the `iexcel_access_token` cookie.
2. If the cookie is absent, redirect to `/login` with the current URL stored in an `iexcel_redirect_after_login` cookie (`SameSite=Lax`, `Secure`, not `httpOnly` — the path is not sensitive).
3. If the cookie is present, check `iexcel_token_expires_at` against the current time.
4. If the access token expires within the next 60 seconds (proactive refresh window), attempt a silent refresh (see FR-08).
5. If the refresh succeeds, set updated cookies on the response and allow the request through.
6. If the refresh fails (refresh token absent or rejected), clear all auth cookies and redirect to `/login`.
7. If the access token is not near expiry, allow the request through without modification.

**Note on proxy limitations**: The proxy cannot make arbitrary HTTP calls in the standard Edge runtime. Because Next.js 16 now supports the Node.js runtime for `proxy.ts` (stable since 15.5), the proxy runs on Node.js and can use the Node.js `fetch` API for the token refresh back-channel call to the auth service.

### FR-07: Forwarding User Identity

After session validation, the proxy must forward the user's `sub` claim to the downstream request by setting a request header `x-user-sub` derived from the access token payload. This allows Server Components to read the user identity from the request headers without re-validating the token.

**Implementation note**: The proxy decodes the JWT payload (base64url decode only — no signature verification). Full signature verification happens in the auth service and is not repeated in the proxy for performance. The `x-user-sub` header is internal only (never exposed to the browser).

### FR-08: Silent Token Refresh in Proxy

When the proxy determines the access token is about to expire (within 60-second window):

1. Read the `iexcel_refresh_token` cookie.
2. If absent, redirect to `/login`.
3. Call the auth service `/token` endpoint (server-side) with:
   - `grant_type=refresh_token`
   - `refresh_token={cookie value}`
   - `client_id=iexcel-ui`
4. On success: set new `iexcel_access_token`, `iexcel_token_expires_at` cookies on the response; if the auth service returns a new refresh token (token rotation), update `iexcel_refresh_token` as well. Allow the original request through.
5. On failure (expired, revoked, or network error): clear all auth cookies, redirect to `/login`.

---

## 3. Logout Flow

### FR-09: Logout Action

A Server Function (or Route Handler) at `POST /auth/logout` must:

1. Clear all auth cookies: `iexcel_access_token`, `iexcel_refresh_token`, `iexcel_token_expires_at` (set `maxAge: 0`).
2. Optionally redirect to the auth service logout endpoint to end the IdP SSO session:
   - `GET {AUTH_ISSUER_URL}/logout?post_logout_redirect_uri={NEXT_PUBLIC_APP_URL}/login&client_id=iexcel-ui`
   - This is optional but recommended for a complete SSO logout. If the auth service does not support RP-initiated logout, skip and redirect locally to `/login`.
3. Redirect the browser to `/login`.

### FR-10: Logout UI

The `DashboardLayout` sidebar must include a "Logout" button that:
- Submits a `POST` request to `/auth/logout` (using a `<form>` with `method="post"` action, or a Server Function call).
- Does not expose any token values in the request body or URL.
- After the server clears cookies and redirects, the browser lands on `/login`.

---

## 4. AuthProvider and useAuth Hook

### FR-11: AuthProvider Component

An `AuthProvider` React context provider must wrap the `(dashboard)` route group layout. It must:

- Accept a `user` prop (of type `AuthenticatedUser`) passed from the Server Component layout, which reads it from the `/me` API response.
- Make the user object available to all client components within the dashboard route group via React context.
- Not make any client-side fetch calls on mount. All data is passed down from the server.

### FR-12: AuthenticatedUser Type

```typescript
export interface AuthenticatedUser {
  sub: string;          // from OIDC token — the canonical user ID
  email: string;        // from OIDC token
  name: string;         // from OIDC token
  role: 'admin' | 'account_manager' | 'team_member'; // from API /me
  assignedClientIds: string[];  // from API /me — clients this user can access
}
```

### FR-13: useAuth Hook

A `useAuth()` client-side hook must be provided. It must:
- Return `{ user: AuthenticatedUser }` when called inside `AuthProvider`.
- Throw a meaningful error if called outside `AuthProvider` (development safety check).
- Be the single import for any client component that needs user information.

```typescript
// Usage in any client component within (dashboard)
'use client'
import { useAuth } from '@/auth/AuthProvider'

export function UserAvatar() {
  const { user } = useAuth()
  return <Avatar name={user.name} email={user.email} />
}
```

### FR-14: Server-Side /me Call

The `(dashboard)/layout.tsx` Server Component must:

1. Read the `x-user-sub` request header (set by the proxy) to get the user's `sub`.
2. Call the product API `GET /me` endpoint using `@iexcel/api-client`, passing the access token from the `iexcel_access_token` cookie as the Bearer token.
3. Receive back `{ role, assignedClientIds }`.
4. Combine with the identity data decoded from the access token (`sub`, `email`, `name`) to construct an `AuthenticatedUser`.
5. Pass the `AuthenticatedUser` to `<AuthProvider user={user}>` which wraps `{children}`.

**Error handling**: If the `/me` call fails (e.g., network error or 401), the layout must redirect to `/login`. This is a safety net — the proxy should have already caught invalid tokens, but the layout handles edge cases.

---

## 5. API Client Token Integration

### FR-15: Token Provider for api-client

`@iexcel/api-client` accepts a `tokenProvider` function in its configuration. The auth flow must provide this function in the `(dashboard)` layout or a shared server utility:

```typescript
// The token provider reads the access token from the httpOnly cookie
// in Server Components/Route Handlers
async function getAccessToken(): Promise<string> {
  const cookieStore = await cookies()
  const token = cookieStore.get('iexcel_access_token')
  if (!token) throw new Error('No access token available')
  return token.value
}
```

Client components that need to make API calls use the api-client instance provided through a separate `ApiClientProvider` (or the api-client is called from Server Components only — the preferred pattern is to call the API from Server Components and pass data as props to Client Components).

---

## 6. Environment Variables

### FR-16: Required Environment Variables

| Variable | Scope | Description |
|---|---|---|
| `AUTH_ISSUER_URL` | Server-only | e.g. `https://auth.iexcel.com` — the OIDC issuer URL. Used to construct `/authorize`, `/token`, and logout URLs. |
| `NEXT_PUBLIC_APP_URL` | Public (browser + server) | e.g. `https://app.iexcel.com` — the UI's own URL. Used to construct the `redirect_uri`. Must not have a trailing slash. |
| `API_BASE_URL` | Server-only | The product API base URL. Used by the `/me` call in the dashboard layout. |

No client secret is required — `iexcel-ui` is a public OIDC client.

---

## 7. User Workflows

### 7.1 First-Time Login

```
User navigates to https://app.iexcel.com/
  → Proxy detects no session cookie
  → Proxy stores return URL in iexcel_redirect_after_login cookie
  → Proxy redirects to /login
  → User clicks "Login with SSO"
  → App generates PKCE, stores in iexcel_pkce cookie
  → App redirects to https://auth.iexcel.com/authorize?...
  → Auth service redirects to IdP (Google/Okta)
  → User authenticates with IdP
  → IdP redirects back to auth service
  → Auth service issues tokens, redirects to /auth/callback?code=...&state=...
  → Callback handler validates state, exchanges code for tokens
  → Tokens stored in httpOnly cookies
  → User redirected to / (or the originally requested path)
  → Dashboard layout calls /me, constructs AuthenticatedUser
  → AuthProvider makes user available to all client components
```

### 7.2 Returning User (Active Session)

```
User navigates to any protected route
  → Proxy reads iexcel_access_token cookie — valid, not near expiry
  → Request passes through
  → Server Component renders with user data from cookies
```

### 7.3 Silent Token Refresh

```
User is active, access token expires in < 60 seconds
  → Proxy detects expiry window
  → Proxy calls auth service /token with refresh_token grant (server-side)
  → Auth service returns new access token (and optionally new refresh token)
  → Proxy sets updated cookies on the response
  → User's request continues without interruption
```

### 7.4 Logout

```
User clicks "Logout" in sidebar
  → Form POST to /auth/logout
  → Server clears all auth cookies
  → Browser redirected to /login (or auth service logout endpoint first)
  → Subsequent protected route access triggers login flow
```

### 7.5 SSO Shortcut (Cross-App Session)

```
User already logged in via terminal (active IdP SSO session)
  → User opens browser, navigates to app
  → Proxy redirects to /login (no session cookie yet)
  → User clicks "Login with SSO"
  → Auth service redirects to IdP
  → IdP sees active session, skips password prompt
  → Auth service issues tokens immediately
  → User lands on dashboard without entering credentials
```

---

## 8. Error Handling

| Scenario | User-Facing Behaviour | Internal Behaviour |
|---|---|---|
| Provider sends `error` in callback | `/auth/error` page with `error_description` shown | Log to server console |
| State mismatch in callback | `/auth/error` with "Login session expired" message | Log warning — possible CSRF attempt |
| Token exchange HTTP error | `/auth/error` with generic "Authentication failed" | Log full error response server-side |
| `/me` API call fails in layout | Redirect to `/login` | Log error; do not crash the layout |
| Refresh token expired/revoked | Redirect to `/login` | Clear all auth cookies before redirect |
| Auth service unreachable during refresh | Redirect to `/login` | Log network error server-side |
| User navigates directly to `/auth/callback` without PKCE cookie | `400` error page | Log the attempt |

---

## 9. Validation Rules

| Input | Validation |
|---|---|
| `state` in callback | Must exactly match the value from `iexcel_pkce` cookie. Base64url-safe characters only. |
| `code` in callback | Must be present and non-empty. |
| `error` in callback | If present, abort token exchange immediately. |
| `iexcel_access_token` cookie | Must be present for all protected routes. Proxy handles absence. |
| `iexcel_refresh_token` cookie | Must be present for silent refresh to proceed. |
| `x-user-sub` header | Must be a valid non-empty UUID string. If missing in dashboard layout, fall back to decoding the access token. |

---

## 10. Security Requirements

| Requirement | Implementation |
|---|---|
| PKCE with S256 required | `code_challenge_method=S256` enforced in FR-02. No fallback to plain. |
| State parameter CSRF protection | State generated per login attempt, validated in callback before token exchange (FR-03 step 4). |
| Tokens never exposed to JavaScript | All token cookies are `httpOnly`. No token values in client-side JavaScript. |
| SameSite protection | All auth cookies use `SameSite=Lax`. Tokens are never sent on cross-site requests. |
| Secure cookie flag | All auth cookies use `Secure: true`. Never sent over HTTP. |
| Token not logged | Access and refresh token values must never appear in server logs or error messages. |
| `/shared/*` exclusion | PublicLayout routes bypass the proxy entirely. Client users are never redirected to login. |
| No client secret | `iexcel-ui` is a public client. No secret to protect or rotate. |
| Logout clears all state | All three auth cookies are cleared on logout before any redirect. |
