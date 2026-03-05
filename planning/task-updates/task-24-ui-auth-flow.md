# Task Update: Feature 24 — UI Auth Flow

**Status:** Complete
**Date:** 2026-03-05
**Branch:** main

---

## Summary

Implemented the complete authentication flow for the Next.js UI application, covering PKCE login, token exchange, session management via httpOnly cookies, silent refresh, logout, AuthProvider context, and dashboard layout integration.

---

## Files Created

| File | Purpose |
|---|---|
| `apps/ui/src/auth/types.ts` | `AuthenticatedUser` interface |
| `apps/ui/src/auth/cookies.ts` | Cookie name constants and base configuration |
| `apps/ui/src/auth/token-utils.ts` | JWT decode, state generation, expiry check, silentRefresh |
| `apps/ui/src/auth/AuthProvider.tsx` | Context provider + `useAuth` hook (client component) |
| `apps/ui/src/auth/api-token-provider.ts` | `TokenProvider` implementation reading from httpOnly cookies |
| `apps/ui/src/app/login/page.tsx` | Login page with authenticated-user redirect guard |
| `apps/ui/src/app/login/actions.ts` | `startLogin` Server Action — PKCE generation + authorize redirect |
| `apps/ui/src/app/login/LoginButton.tsx` | Client component wrapping the Server Action form |
| `apps/ui/src/app/login/login.module.scss` | Login page styles |
| `apps/ui/src/app/auth/callback/route.ts` | GET /auth/callback — state validation, code exchange, cookie set |
| `apps/ui/src/app/auth/logout/route.ts` | POST /auth/logout — cookie clearing + redirect to /login |
| `apps/ui/src/app/auth/error/page.tsx` | /auth/error — user-friendly auth error display |
| `apps/ui/src/app/auth/error/error.module.scss` | Error page styles |
| `apps/ui/proxy.ts` | Next.js 16 auth guard proxy (replaces middleware.ts) |
| `apps/ui/.env.example` | Environment variable documentation |

## Files Modified

| File | Change |
|---|---|
| `apps/ui/src/app/(dashboard)/layout.tsx` | Added cookie read, JWT decode, /me call, AuthProvider wrap |
| `apps/ui/src/layouts/DashboardLayout.tsx` | Added logout form button in the user section |
| `apps/ui/src/layouts/DashboardLayout.module.scss` | Added logout button styles |
| `apps/ui/tsconfig.json` | Added workspace package paths to resolve `@iexcel/*` imports |
| `apps/ui/project.json` | Added `auth-client` to `implicitDependencies` |

---

## Key Implementation Decisions

### Auth-Client API Adaptation
The TR spec was written against an assumed API shape, but the actual `@iexcel/auth-client` functions have different signatures:
- `buildAuthorizeUrl(config, state, codeChallenge)` — positional args, not options object
- `exchangeCodeForTokens(config, callbackUrl, expectedState, codeVerifier)` — takes the full callback URL string and handles code/state extraction internally
- `refreshAccessToken(config, refreshToken)` — refreshToken is a separate positional arg
- `TokenSet` uses camelCase (`accessToken`, `refreshToken`, `expiresIn`, `expiresAt`)

All implementations were adapted to match the actual package contracts.

### TokenProvider Interface
`@iexcel/api-client`'s `TokenProvider` interface requires `getAccessToken()` and `refreshAccessToken()` methods (not a plain function). The `createCookieTokenProvider()` factory in `api-token-provider.ts` creates a compliant implementation.

### /me Response Shape
`GetCurrentUserResponse` returns `{ user: ProductUser }` where `ProductUser` has `role` but no `assignedClientIds`. The dashboard layout defaults `assignedClientIds` to `[]` until the API is updated. This is logged in a code comment for the next iteration.

### SCSS Token Corrections
The spec references `$color-error` and `$color-white` which do not exist in the ui-tokens package. Corrected to `$color-danger` and `$color-text-inverse` respectively.

### tsconfig.json Fix
The UI's `tsconfig.json` overrides the base paths entirely (TypeScript's path merge behaviour), causing pre-existing `@iexcel/*` import failures in the type checker. Fixed by re-declaring workspace paths relative to the UI app's location.

---

## Security Notes

- All three auth token cookies (`iexcel_access_token`, `iexcel_refresh_token`, `iexcel_token_expires_at`) are `httpOnly: true` — not accessible via `document.cookie`.
- `secure` flag is environment-aware: `true` in production, `false` in local development.
- PKCE state is validated before token exchange (CSRF protection).
- Redirect paths from the `iexcel_redirect_after_login` cookie are validated to start with `/` to prevent open redirect attacks.
- Token values are never logged.

---

## Reviewer Notes

- Tasks 7.1, 7.2, 7.3 (integration/E2E/security testing) require the auth service (feature 05) to be running and cannot be automated here.
- The proxy is at `apps/ui/proxy.ts` — **not** `middleware.ts`. This is the Next.js 16 naming convention per the TR spec.
- The `console.warn`/`console.error` calls in server Route Handlers generate `no-console` lint warnings, consistent with the project's existing patterns in `apps/auth/` (0 errors, warnings are acceptable per Nx lint configuration).
