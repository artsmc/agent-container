# Feature 32: Terminal Device Auth

## Summary

Implemented the `@iexcel/terminal-auth` package at `packages/terminal-auth/`, providing login, logout, and token-management for CLI tools via the OAuth 2.0 Device Authorization Grant (RFC 8628).

## Work Accomplished

### Package Scaffolding (Phase 1)
- `package.json`: `@iexcel/terminal-auth`, type=module, deps on `@iexcel/auth-client` (workspace) and `jose`.
- `project.json`: Nx library config with `build`, `lint`, `test`, and `type-check` targets. Tags: `scope:terminal`, `type:library`.
- `tsconfig.json`: Extends root base with strict mode and exactOptionalPropertyTypes.
- `tsconfig.lib.json`: Emit config for build output at `dist/packages/terminal-auth`.
- `vitest.config.ts`: V8 coverage with 90% thresholds.

### Core Types and Config (Phase 2)
- `src/types/index.ts`: `UserProfile` (sub, email, name) and `StoredTokensWithProfile` extending `StoredTokens` with a `user` field.
- `src/errors/index.ts`: `AuthRequiredError` extending `AuthClientError` with code `AUTH_REQUIRED`.
- `src/config/config.ts`: Immutable config object driven by env vars (`AUTH_ISSUER_URL`, `AUTH_CLIENT_ID`, `AUTH_TOKEN_PATH`) with iExcel platform defaults.
- `src/display/terminal-output.ts`: `print` (stdout) and `printError` (stderr) utilities.

### Login Command (Phase 3)
- `src/commands/login.ts`: Checks for an existing valid session before initiating a new device flow. Decodes the `id_token` with `decodeJwt` from `jose` to extract `UserProfile`. Builds and persists `StoredTokensWithProfile` via `saveTokens`. Handles all `DeviceFlowError` reasons with user-friendly messages.

### Logout Command (Phase 4)
- `src/commands/logout.ts`: Loads existing tokens first; if none exist, prints "No active session found." Otherwise clears and confirms.

### Token Manager (Phase 5)
- `src/auth/token-manager.ts`: `getValidAccessToken(options?)` with:
  - Fast path: returns cached access token if still fresh (within refresh buffer).
  - Silent refresh via `refreshAccessToken` from `@iexcel/auth-client/refresh`.
  - Token rotation: saves new refresh token if returned.
  - `invalid_grant` handling: clears tokens, triggers login or throws `AuthRequiredError`.
  - Network error handling: returns existing token if not fully expired.
  - Mutex: deduplicates concurrent refresh calls via a shared in-flight promise.

### Public API (Phase 7)
- `src/index.ts`: Re-exports `login`, `logout`, `getValidAccessToken`, `AuthRequiredError`, `StoredTokensWithProfile`, `UserProfile`.

### Path Alias
- Added `"@iexcel/terminal-auth": ["packages/terminal-auth/src/index.ts"]` to `tsconfig.base.json`.

### ESLint Config
- Created `eslint.config.js` at workspace root using ESLint v9 flat config with `@typescript-eslint/parser`. This was a pre-existing gap affecting all packages; its absence is not introduced by this feature.

## Verification

- `npx nx type-check terminal-auth` — passes with zero TypeScript errors.
- `npx nx lint terminal-auth` — passes with zero lint errors.

## Reviewer Notes

- `~ ` in `tokenPath` is resolved to `os.homedir()` at runtime in both `login.ts` and `logout.ts` via the shared `resolveTokenPath` utility. This logic is intentionally duplicated in two files rather than shared as a module because both commands are self-contained and the helper is trivial (SRP). If it grows in complexity, extract to `src/utils/resolve-path.ts`.
- The token manager's mutex (`inflightRefresh`) is module-scoped — suitable for a CLI process with a single user session. If this package is ever used in a long-lived server process with multiple concurrent users, the mutex will need to be keyed by user/token path.
- The `eslint.config.js` at repo root enables linting across all packages. It is intentionally minimal to avoid disrupting existing packages; stricter TypeScript rules can be layered on incrementally.
