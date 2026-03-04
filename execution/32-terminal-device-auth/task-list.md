# Task List
# Feature 32: Terminal Device Auth

**Date:** 2026-03-03
**Output path:** `packages/terminal-auth/`

---

## Prerequisites

Before starting this feature, confirm these upstream features are complete:
- [ ] Feature 05 (Auth Service) — `POST /device/authorize`, `POST /device/token`, `POST /token` endpoints are live and tested
- [ ] Feature 06 (Auth Client Package) — `@iexcel/auth-client` is published in the Nx workspace with `initiateDeviceFlow`, `pollDeviceToken`, `refreshAccessToken`, `saveTokens`, `loadTokens`, `clearTokens` all exported and tested

---

## Phase 1: Package Scaffolding (Small)

- [ ] **1.1** Create `packages/terminal-auth/` directory in the Nx monorepo
  - Verification: `ls packages/terminal-auth/` succeeds

- [ ] **1.2** Create `packages/terminal-auth/project.json` with the Nx library configuration
  - Use `@nx/js:tsc` build executor, `@nx/eslint:lint`, `@nx/vite:test`
  - Tags: `["scope:terminal", "type:library"]`
  - References: TR.md §4.1
  - Verification: `nx show project terminal-auth` outputs correct config

- [ ] **1.3** Create `packages/terminal-auth/package.json` with `@iexcel/auth-client` as runtime dependency
  - References: TR.md §4.2
  - Verification: `pnpm install` succeeds with no new external packages added

- [ ] **1.4** Create `packages/terminal-auth/tsconfig.json`, `tsconfig.lib.json`, and `tsconfig.spec.json`
  - Extend `../../tsconfig.base.json`; set `strict: true`
  - Add project reference to `packages/auth-client/tsconfig.lib.json`
  - References: TR.md §5
  - Verification: `nx run terminal-auth:type-check` passes with empty src/

- [ ] **1.5** Create `packages/terminal-auth/vite.config.ts` for Vitest
  - References: TR.md §13
  - Verification: `nx run terminal-auth:test` runs (0 tests, pass)

- [ ] **1.6** Create empty barrel file `packages/terminal-auth/src/index.ts`
  - Verification: `nx run terminal-auth:build` succeeds

---

## Phase 2: Core Types and Configuration (Small)

- [ ] **2.1** Create `packages/terminal-auth/src/types/index.ts`
  - Define `UserProfile` interface
  - Define `StoredTokensWithProfile` extending `StoredTokens` from `@iexcel/auth-client/types`
  - References: TR.md §6.1, FRS.md §3.2
  - Verification: TypeScript strict mode compilation passes

- [ ] **2.2** Create `packages/terminal-auth/src/errors/index.ts`
  - Define `AuthRequiredError` extending `AuthClientError`
  - `code: 'AUTH_REQUIRED'`
  - References: TR.md §6.2, FRS.md §5.4
  - Verification: TypeScript compilation passes; `instanceof AuthClientError` check is true

- [ ] **2.3** Create `packages/terminal-auth/src/config/config.ts`
  - Export `config` object: `issuerUrl`, `tokenPath`, `refreshBufferSeconds`, `clientId`
  - Read from environment with documented defaults
  - References: TR.md §7, FRS.md §8
  - Verification: `config.issuerUrl === 'https://auth.iexcel.com'` when `AUTH_ISSUER_URL` is unset

- [ ] **2.4** Create `packages/terminal-auth/src/display/terminal-output.ts`
  - Export `print(message: string): void` → writes to `process.stdout`
  - Export `printError(message: string): void` → writes to `process.stderr`
  - References: TR.md §8.2, FRS.md §9.3
  - Verification: Unit test confirms stdout/stderr routing

---

## Phase 3: Login Command (Medium)

- [ ] **3.1** Create `packages/terminal-auth/src/commands/login.ts` — stub with correct signature
  - `export async function login(): Promise<StoredTokensWithProfile>`
  - Verification: TypeScript compilation passes

- [ ] **3.2** Implement existing-session check in `login.ts`
  - Call `loadTokens({ filePath: config.tokenPath })` from `@iexcel/auth-client/token-storage`
  - If tokens valid and not expiring soon: print "Already authenticated as {email}" and return
  - References: FRS.md §2.6
  - Verification: Unit test with mock `loadTokens` returning valid tokens

- [ ] **3.3** Implement device flow initiation in `login.ts`
  - Call `initiateDeviceFlow({ clientId, issuerUrl })` from `@iexcel/auth-client/device-flow`
  - Display verification URL and user code using `print()`
  - References: FRS.md §2.3, TR.md §10.1
  - Verification: Unit test with `msw` mock for `POST /device/authorize`; assert correct stdout output

- [ ] **3.4** Implement polling loop in `login.ts`
  - Call `pollDeviceToken(...)` from `@iexcel/auth-client/device-flow`
  - Handle `DeviceFlowError` variants with user-facing messages to stderr
  - References: FRS.md §2.3 steps 5-7, FRS.md §2.5, TR.md §10.2
  - Verification: Unit tests for expired, access_denied, and server_error cases

- [ ] **3.5** Implement ID token claim extraction and `StoredTokensWithProfile` assembly in `login.ts`
  - Use `decodeJwt` from `jose` (imported via transitive dep) to extract `sub`, `email`, `name`
  - Build `StoredTokensWithProfile` with correct `expires_at` (now + expires_in) and `issued_at`
  - References: TR.md §8.1, FRS.md §3.2
  - Verification: Unit test verifies `user.email` equals the email claim in a mock id_token

- [ ] **3.6** Implement token persistence in `login.ts`
  - Call `saveTokens(stored, { filePath: config.tokenPath })` from `@iexcel/auth-client/token-storage`
  - Print "Authenticated as {email}" on success
  - References: FRS.md §2.3 steps 6-8
  - Verification: Integration test writes to temp dir; assert file exists with 0600 permissions

- [ ] **3.7** Write comprehensive unit tests for `login.ts` in `src/__tests__/login.test.ts`
  - Happy path complete flow
  - Already authenticated (valid session)
  - Device code expired
  - Access denied
  - Network error on `POST /device/authorize`
  - References: GS.md — Feature: Login scenarios
  - Verification: All tests pass; coverage >= 90%

---

## Phase 4: Logout Command (Small)

- [ ] **4.1** Create `packages/terminal-auth/src/commands/logout.ts`
  - `export async function logout(): Promise<void>`
  - Call `clearTokens({ filePath: config.tokenPath })` from `@iexcel/auth-client/token-storage`
  - Print "Logged out. Your session has been cleared." on success
  - Print "No active session found." if token file doesn't exist
  - References: FRS.md §6, GS.md — Feature: Logout
  - Verification: Unit test confirms correct stdout for both cases

- [ ] **4.2** Write unit tests for `logout.ts` in `src/__tests__/logout.test.ts`
  - Clear existing session
  - Logout when not authenticated
  - Verification: All tests pass

---

## Phase 5: Token Manager — `getValidAccessToken` (Medium)

- [ ] **5.1** Create `packages/terminal-auth/src/auth/token-manager.ts` — stub
  - `export async function getValidAccessToken(options?: { interactive?: boolean }): Promise<string>`
  - Verification: TypeScript compilation passes

- [ ] **5.2** Implement valid token fast-path in `token-manager.ts`
  - Call `loadTokens()`; check `expires_at > now + refreshBufferSeconds`; return `access_token` directly
  - References: FRS.md §5.3 (steps 1-3)
  - Verification: Unit test with unexpired mock tokens returns immediately without any HTTP calls

- [ ] **5.3** Implement silent refresh path in `token-manager.ts`
  - Call `refreshAccessToken(...)` from `@iexcel/auth-client/refresh`
  - Save updated tokens (including new refresh token if rotation occurred)
  - References: FRS.md §4.3, TR.md §9
  - Verification: Unit test with expired access token; mock refresh endpoint returns new tokens; assert new access_token returned and saved

- [ ] **5.4** Implement refresh token rotation in `token-manager.ts`
  - If `newTokenSet.refresh_token` is present, replace old refresh token in persisted file
  - References: FRS.md §4.5, GS.md — Scenario: Refresh token rotation
  - Verification: Unit test asserts new refresh_token in saved file when auth service returns one

- [ ] **5.5** Implement `invalid_grant` handling in `token-manager.ts`
  - Catch `TokenRefreshError` with `oauthErrorCode === 'invalid_grant'`
  - Clear tokens and trigger interactive login or throw `AuthRequiredError`
  - References: FRS.md §4.4, GS.md — Scenario: Refresh token has expired
  - Verification: Unit test for invalid_grant in interactive mode triggers login; non-interactive throws AuthRequiredError

- [ ] **5.6** Implement network error fallback in `token-manager.ts`
  - If refresh fails with network error and access token is still valid: return existing token
  - If refresh fails with network error and access token is also expired: handle per interactive flag
  - References: FRS.md §4.4, GS.md — Scenario: Network error during refresh
  - Verification: Unit test with simulated network failure and non-expired access token

- [ ] **5.7** Implement refresh deduplication mutex in `token-manager.ts`
  - `let refreshInFlight: Promise<string> | null = null;`
  - If refresh is already in progress, return the in-flight promise
  - References: FRS.md §5.5, TR.md §9, GS.md — Scenario: Two concurrent callers
  - Verification: Unit test launches two concurrent `getValidAccessToken()` calls; assert `POST /token` called exactly once

- [ ] **5.8** Implement no-session path in `token-manager.ts`
  - `loadTokens()` returns null: trigger `login()` if interactive, throw `AuthRequiredError` if not
  - References: FRS.md §5.3 (step 2), GS.md — Feature: Automatic Login Trigger
  - Verification: Unit test with no token file; interactive mode calls `login()`; non-interactive throws

- [ ] **5.9** Write comprehensive unit tests for `token-manager.ts` in `src/__tests__/token-manager.test.ts`
  - Valid token returned directly
  - Proactive refresh (within 60s of expiry)
  - Expired token silent refresh
  - Refresh rotation
  - invalid_grant → re-login (interactive)
  - invalid_grant → AuthRequiredError (non-interactive)
  - Network error + valid token → use existing
  - No session + interactive → login()
  - No session + non-interactive → AuthRequiredError
  - Concurrent deduplication
  - References: GS.md — Feature: Silent Refresh scenarios
  - Verification: All tests pass; coverage >= 90%

---

## Phase 6: Token Storage Integration Tests (Small)

- [ ] **6.1** Write integration tests for token file operations in `src/__tests__/token-storage.test.ts`
  - Write `StoredTokensWithProfile` to temp dir; read back; assert round-trip equality
  - Assert file created with permissions 0600 on Unix
  - Assert directory created with permissions 0700 on Unix
  - Corrupted JSON file → `loadTokens` returns null
  - Missing file → `loadTokens` returns null
  - References: FRS.md §3.3, §3.4, GS.md — Feature: Token Storage scenarios
  - Verification: All tests pass

- [ ] **6.2** Verify cross-tool token compatibility (schema test)
  - Write a mock token file manually (as if written by Claw)
  - Assert `loadTokens()` can read it and `getValidAccessToken()` returns the access_token
  - References: FRS.md §3.5, GS.md — Scenario: Token file written by Claw is readable
  - Verification: Test passes

---

## Phase 7: Public API Barrel and Integration (Small)

- [ ] **7.1** Populate `packages/terminal-auth/src/index.ts` with all public exports
  - `login`, `logout`, `getValidAccessToken`, `AuthRequiredError`, `StoredTokensWithProfile`
  - References: FRS.md §7, TR.md §3
  - Verification: Consumer import `import { getValidAccessToken } from '@iexcel/terminal-auth'` resolves correctly

- [ ] **7.2** Add `terminal-auth` to `tsconfig.base.json` path aliases in the Nx workspace root
  - Add `"@iexcel/terminal-auth": ["packages/terminal-auth/src/index.ts"]`
  - Verification: Feature 33 can import `@iexcel/terminal-auth` without pre-building

- [ ] **7.3** Verify `nx affected` includes `terminal-mcp-tools` (Feature 33) when `terminal-auth` is modified
  - Verification: `nx graph` shows `terminal-auth` → `terminal-mcp-tools` dependency edge

---

## Phase 8: CI and Coverage Verification (Small)

- [ ] **8.1** Run `nx run terminal-auth:test --coverage` and confirm >= 90% line/branch coverage
  - References: TR.md §13.3
  - Verification: Vitest output shows coverage >= 90%

- [ ] **8.2** Run `nx run terminal-auth:lint` and fix any lint errors
  - Verification: Zero lint errors

- [ ] **8.3** Run `nx run terminal-auth:type-check` and confirm zero TypeScript errors
  - Verification: Zero type errors

- [ ] **8.4** Run `nx run terminal-auth:build` and confirm the library builds cleanly
  - Verification: `dist/packages/terminal-auth/` exists and contains compiled output

---

## Phase 9: Manual Smoke Test (Medium — requires running auth service)

- [ ] **9.1** Configure `AUTH_ISSUER_URL` to point at the running auth service (Feature 05)
  - Prerequisite: Feature 05 is deployed and the `iexcel-terminal` client is seeded

- [ ] **9.2** Run the login command manually from the project root
  - Verify the verification URL and user code are displayed correctly
  - Complete the device flow in a browser
  - Verify tokens are written to `~/.iexcel/auth/tokens.json`
  - Verify file permissions are 0600: `stat ~/.iexcel/auth/tokens.json`
  - Verify user profile is correct in the token file

- [ ] **9.3** Run `getValidAccessToken()` from a test script immediately after login
  - Verify it returns the access token without triggering a new login

- [ ] **9.4** Manually expire the access token (edit `expires_at` to a past timestamp in the token file)
  - Run `getValidAccessToken()` again
  - Verify silent refresh occurs (new tokens written to disk)
  - Verify returned token differs from the expired one

- [ ] **9.5** Run the logout command
  - Verify "Logged out. Your session has been cleared." is printed
  - Verify token file is deleted or cleared
  - Run `getValidAccessToken({ interactive: false })` and verify `AuthRequiredError` is thrown

---

## Completion Checklist

- [ ] All Phase 1–8 tasks are complete
- [ ] `nx run terminal-auth:test --coverage` passes with >= 90% coverage
- [ ] `nx run terminal-auth:lint` passes with zero errors
- [ ] `nx run terminal-auth:type-check` passes with zero errors
- [ ] `nx run terminal-auth:build` succeeds
- [ ] Manual smoke test (Phase 9) is complete against a running auth service
- [ ] `@iexcel/terminal-auth` exports `getValidAccessToken`, `login`, `logout`, `AuthRequiredError`
- [ ] Token file is written at `~/.iexcel/auth/tokens.json` with 0600 permissions
- [ ] Feature 33 can import `getValidAccessToken` from `@iexcel/terminal-auth`
