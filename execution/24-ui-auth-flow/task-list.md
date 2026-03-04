# Task List
## Feature 24: UI Auth Flow
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Last Updated:** 2026-03-03

---

## Prerequisites

Before starting any task, confirm:
- [ ] Feature 05 (auth-service) is deployed and reachable. Verify `https://auth.iexcel.com/.well-known/openid-configuration` returns a valid discovery document.
- [ ] Feature 06 (auth-client-package) is complete. Verify `@iexcel/auth-client/auth-code` and `@iexcel/auth-client/refresh` exports are available.
- [ ] Feature 23 (ui-scaffolding) is complete. `apps/ui` runs on Next.js 16 with App Router, route group `(dashboard)`, and `PublicLayout`.
- [ ] Feature 22 (api-client-package) is complete. `@iexcel/api-client` is available with a `getMe()` method and token provider interface.

---

## Phase 1: Foundation — Types, Utilities, Environment

### Task 1.1 — Define `AuthenticatedUser` type
- Create `apps/ui/src/auth/types.ts`
- Define `AuthenticatedUser` interface: `sub`, `email`, `name`, `role` (union), `assignedClientIds`
- Export from `apps/ui/src/auth/types.ts`
- References: FRS.md §FR-12, TR.md §6
- Size: small

### Task 1.2 — Implement token utilities
- Create `apps/ui/src/auth/token-utils.ts`
- Implement `decodeJwtPayload(jwt: string): Record<string, unknown> | null` — base64url decode only, no verification
- Implement `generateState(): string` — 32 random bytes, base64url encoded using `webcrypto`
- Implement `isNearExpiry(expiresAtSeconds: number, windowSeconds = 60): boolean`
- Implement `silentRefresh(refreshToken: string): Promise<RefreshedTokens>` — calls `refreshAccessToken` from `@iexcel/auth-client/refresh`
- Write unit tests in `apps/ui/src/auth/token-utils.test.ts` using vitest
- References: TR.md §9, §3.3, §3.4
- Size: small

### Task 1.3 — Define cookie constants
- Create `apps/ui/src/auth/cookies.ts`
- Export all cookie name constants (`COOKIE_ACCESS_TOKEN`, `COOKIE_REFRESH_TOKEN`, `COOKIE_EXPIRES_AT`, `COOKIE_PKCE`, `COOKIE_REDIRECT`)
- Export `SECURE_COOKIE_BASE` with `httpOnly: true`, `sameSite: 'lax'`, `secure: process.env.NODE_ENV === 'production'`, `path: '/'`
- Export `REFRESH_TOKEN_MAX_AGE = 2592000`
- References: TR.md §8, §12
- Size: small

### Task 1.4 — Add environment variables
- Add `AUTH_ISSUER_URL`, `NEXT_PUBLIC_APP_URL`, `API_BASE_URL` to `apps/ui/.env.local` for local development
- Document all three variables in `apps/ui/.env.example` (committed to repo with placeholder values)
- Confirm `NEXT_PUBLIC_APP_URL` is accessible in the browser (prefixed correctly)
- References: FRS.md §FR-16, TR.md §10
- Size: small

### Task 1.5 — Update Nx project.json implicit dependencies
- Add `auth-client` to `implicitDependencies` in `apps/ui/project.json`
- Verify `api-client` is already present (from feature 23 scaffold)
- Run `nx graph` and confirm `ui` shows dependency edges to both `auth-client` and `api-client`
- References: TR.md §13.2
- Size: small

---

## Phase 2: Proxy (Auth Guard)

### Task 2.1 — Create `proxy.ts` auth guard
- Create `apps/ui/proxy.ts` (Next.js 16 — NOT `middleware.ts`)
- Export `proxy(request: NextRequest)` async function (NOT `middleware`)
- Implement matcher config excluding: `/login`, `/auth/*`, `/shared/*`, `/_next/*`, favicon, robots, sitemap
- Implement no-session redirect to `/login` with `iexcel_redirect_after_login` cookie (not httpOnly, max 5 min)
- Implement near-expiry detection using `COOKIE_EXPIRES_AT` — 60 second window
- Implement `x-user-sub` header forwarding via `decodeJwtPayload` (proxy-safe, no verification)
- Call `silentRefresh` from `@/auth/token-utils` when near expiry; redirect to `/login` on failure
- Clear all auth cookies before any redirect to `/login`
- References: FRS.md §FR-05 through FR-08, TR.md §3
- Size: large
- **Dependency:** Task 1.2, 1.3

### Task 2.2 — Write proxy matcher unit tests
- Use `unstable_doesProxyMatch` from `next/experimental/testing/server`
- Test: `/` is matched (intercepted)
- Test: `/clients/abc` is matched
- Test: `/login` is NOT matched
- Test: `/auth/callback` is NOT matched
- Test: `/shared/some-token` is NOT matched
- Test: `/_next/static/chunk.js` is NOT matched
- References: TR.md §16.1
- Size: small
- **Dependency:** Task 2.1

---

## Phase 3: Login Flow

### Task 3.1 — Create login page
- Create `apps/ui/src/app/login/page.tsx`
- Server Component — check `iexcel_access_token` cookie; redirect to `/` if already authenticated
- Render login page with `PublicLayout` wrapper (from feature 23)
- Include `LoginButton` client component
- Add metadata: `title: 'Login — iExcel'`
- References: FRS.md §FR-01, TR.md §5
- Size: small
- **Dependency:** Task 1.4

### Task 3.2 — Implement `startLogin` Server Action
- Create `apps/ui/src/app/login/actions.ts`
- Mark with `'use server'`
- Call `generatePkceChallenge()` from `@iexcel/auth-client/auth-code`
- Call `generateState()` from `@/auth/token-utils`
- Set `iexcel_pkce` cookie with `JSON.stringify({ state, codeVerifier })` — httpOnly, 5 min maxAge
- Call `buildAuthorizeUrl()` from `@iexcel/auth-client/auth-code` with all required parameters
- `redirect(authorizeUrl)` — full browser navigation to auth service
- References: FRS.md §FR-02, TR.md §5
- Size: small
- **Dependency:** Task 1.2, 1.3, 1.4

### Task 3.3 — Create `LoginButton` client component
- Create `apps/ui/src/app/login/LoginButton.tsx`
- Mark with `'use client'`
- Render a `<form action={startLogin}>` with a submit button labelled "Login with SSO"
- Apply minimal SCSS styling via a new `login.module.scss` in the same directory
- References: FRS.md §FR-01, TR.md §5
- Size: small
- **Dependency:** Task 3.2

---

## Phase 4: Authorization Code Callback

### Task 4.1 — Implement `GET /auth/callback` Route Handler
- Create `apps/ui/src/app/auth/callback/route.ts`
- Export `GET(request: NextRequest)` async function
- Check for `error` query param → redirect to `/auth/error?message=...`
- Read `iexcel_pkce` cookie; if absent → 400 redirect to `/auth/error?message=Login+session+expired`
- Parse `{ state, codeVerifier }` from PKCE cookie JSON
- Validate returned state === stored state → if mismatch, log warning and 400 redirect
- Call `exchangeCodeForTokens()` from `@iexcel/auth-client/auth-code` in try/catch
- On success: set `iexcel_access_token`, `iexcel_refresh_token`, `iexcel_token_expires_at` cookies with correct attributes
- Clear `iexcel_pkce` and `iexcel_redirect_after_login` cookies (maxAge: 0)
- Redirect to path from `iexcel_redirect_after_login` cookie or fallback to `/`
- References: FRS.md §FR-03, FR-04, TR.md §4.1
- Size: large
- **Dependency:** Task 1.3, 1.4

### Task 4.2 — Write callback handler unit tests
- Mock `exchangeCodeForTokens` with msw
- Test: valid flow — cookies set, redirect to `/`
- Test: valid flow with `iexcel_redirect_after_login` — redirect to stored path
- Test: `error` param present — redirects to `/auth/error`
- Test: missing PKCE cookie — 400 response
- Test: state mismatch — 400 response, no token exchange called
- Test: token exchange throws — redirects to `/auth/error`
- References: TR.md §16.1
- Size: medium
- **Dependency:** Task 4.1

### Task 4.3 — Create `/auth/error` page
- Create `apps/ui/src/app/auth/error/page.tsx`
- Server Component — reads `message` search param from URL
- Renders error message in `PublicLayout`
- Includes a "Try again" link back to `/login`
- References: FRS.md §FR-04
- Size: small

---

## Phase 5: Logout

### Task 5.1 — Implement `POST /auth/logout` Route Handler
- Create `apps/ui/src/app/auth/logout/route.ts`
- Export `POST()` async function
- Set `iexcel_access_token`, `iexcel_refresh_token`, `iexcel_token_expires_at` cookies to `maxAge: 0`
- Redirect to `/login` (or to auth service logout endpoint if RP-initiated logout is confirmed available in feature 05 — see TR.md §18 open question)
- References: FRS.md §FR-09, TR.md §4.2
- Size: small

### Task 5.2 — Write logout handler unit tests
- Test: all three cookies are cleared (maxAge: 0 in Set-Cookie header)
- Test: response redirects to `/login`
- References: TR.md §16.1
- Size: small
- **Dependency:** Task 5.1

### Task 5.3 — Add Logout button to Sidebar
- Update `apps/ui/src/components/Sidebar/Sidebar.tsx`
- Add a `<form method="post" action="/auth/logout">` with a submit button labelled "Logout"
- Place at the bottom of the sidebar navigation
- References: FRS.md §FR-10
- Size: small
- **Dependency:** Task 5.1

---

## Phase 6: AuthProvider, useAuth, Dashboard Layout

### Task 6.1 — Implement `AuthProvider` and `useAuth`
- Create `apps/ui/src/auth/AuthProvider.tsx`
- Mark with `'use client'`
- Create `AuthContext` using `createContext<AuthContextValue | null>(null)`
- Export `AuthProvider({ user, children })` — wraps children in `AuthContext.Provider`
- Export `useAuth()` — reads context, throws `'useAuth must be used within an AuthProvider'` if null
- Write unit tests: provider passes value down, hook throws outside provider
- References: FRS.md §FR-11, FR-13, TR.md §6
- Size: small
- **Dependency:** Task 1.1

### Task 6.2 — Implement API token provider
- Create `apps/ui/src/auth/api-token-provider.ts`
- Export `getAccessToken(): Promise<string>` — reads `iexcel_access_token` cookie via `await cookies()` from `next/headers`
- This function is used in server-side contexts (Server Components, Route Handlers) only
- References: FRS.md §FR-15, TR.md §5 (login/actions.ts pattern)
- Size: small
- **Dependency:** Task 1.3

### Task 6.3 — Update `(dashboard)/layout.tsx` with AuthProvider
- Update `apps/ui/src/app/(dashboard)/layout.tsx`
- Read `iexcel_access_token` cookie via `await cookies()`; redirect to `/login` if absent
- Call `decodeJwtPayload()` to extract `sub`, `email`, `name` from token
- Create `apiClient` using `createApiClient({ baseUrl: API_BASE_URL, tokenProvider: getAccessToken })`
- Call `apiClient.getMe()` in try/catch — redirect to `/login` on error
- Construct `AuthenticatedUser` from token claims + `/me` response
- Wrap `<DashboardLayout>` in `<AuthProvider user={user}>`
- References: FRS.md §FR-14, TR.md §7
- Size: medium
- **Dependency:** Task 6.1, 6.2, Task 1.1, 1.2

---

## Phase 7: Integration Verification

### Task 7.1 — Manual end-to-end auth flow test
- With auth service and API running locally:
  1. Clear cookies; navigate to `/` → confirm redirect to `/login`
  2. Click "Login with SSO" → confirm redirect to auth service `/authorize` with all correct parameters
  3. Complete IdP authentication → confirm redirect to `/auth/callback`
  4. Confirm three auth cookies are set with correct attributes (DevTools → Application → Cookies)
  5. Confirm tokens NOT in `document.cookie` (httpOnly verification)
  6. Confirm `/` renders the dashboard with correct user name and role
  7. Navigate to `/clients/test` → confirm no re-login
  8. Click "Logout" → confirm cookies cleared → confirm redirect to `/login`
  9. Navigate to `/` → confirm redirect to `/login`
- References: TR.md §16.2
- Size: medium (testing only)

### Task 7.2 — Manual silent refresh test
- Set a short `expires_in` (e.g., 120 seconds) on the auth service for the `iexcel-ui` client in dev
- Log in and note the token expiry time
- Wait until 60 seconds before expiry; navigate to any protected route
- Confirm via server logs that `silentRefresh` was called
- Confirm new `iexcel_access_token` cookie appears (updated `maxAge`)
- Confirm no redirect to `/login`
- References: FRS.md §7.3, GS.md §Silent Token Refresh
- Size: small (testing only)

### Task 7.3 — Security verification
- Open DevTools after login; confirm `document.cookie` does NOT contain `iexcel_access_token` or `iexcel_refresh_token`
- Navigate directly to `/auth/callback?code=fake&state=fake`; confirm 400 error (no PKCE cookie)
- Navigate to `/shared/fake-token` without authentication; confirm public page renders (no redirect to `/login`)
- Navigate to `/login` when authenticated; confirm redirect to `/`
- References: TR.md §16.3
- Size: small (testing only)

---

## Phase 8: Documentation and Memory Bank

### Task 8.1 — Update Memory Bank
- After feature is merged, update `systemArchitecture.md` or equivalent memory bank document with:
  - Auth flow file locations (`proxy.ts`, `src/auth/*`, `app/auth/*`, `app/login/*`)
  - Cookie name constants
  - `useAuth()` hook import path
  - Note: `proxy.ts` is the Next.js 16 name for middleware
  - Note: all token cookies are `httpOnly`, `SameSite=Lax`
- Size: small

---

## Task Summary

| Phase | Tasks | Notes |
|---|---|---|
| 1 — Foundation | 1.1–1.5 | No blockers — can start immediately once prerequisites confirmed |
| 2 — Proxy | 2.1–2.2 | Depends on Phase 1 |
| 3 — Login Flow | 3.1–3.3 | Depends on Phase 1 |
| 4 — Callback | 4.1–4.3 | Depends on Phase 1 |
| 5 — Logout | 5.1–5.3 | Independent of Phase 3 & 4 |
| 6 — AuthProvider + Layout | 6.1–6.3 | Depends on Phase 1; 6.3 depends on 6.1 and 6.2 |
| 7 — Integration | 7.1–7.3 | Depends on all prior phases |
| 8 — Memory Bank | 8.1 | After merge |

**Total tasks:** 21
**Estimated size:** 3 large, 7 medium, 11 small
