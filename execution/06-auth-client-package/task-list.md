# Task List
# Feature 06: Auth Client Package (`packages/auth-client`)

**Phase:** Phase 1 — Foundation
**Date:** 2026-03-03
**Blocked by:** Feature 00 (Nx Monorepo Scaffolding), Feature 05 (Auth Service)
**Blocks:** Feature 07 (API Scaffolding), Feature 24 (UI Auth Flow), Feature 32 (Terminal Device Auth), Feature 18 (Mastra Runtime Setup)

---

## Prerequisites

Before starting any task in this feature, confirm:
- [ ] Feature 00 (nx-monorepo-scaffolding) is merged — the `packages/` directory and `tsconfig.base.json` must exist
- [ ] Feature 05 (auth-service) is sufficiently complete to know: JWKS endpoint URL format, token claim structure, signing algorithm (RS256 vs ES256), whether refresh token rotation is implemented
- [ ] Feature 01 (shared-types-package) spec is reviewed to identify any OIDC types already defined there

---

## Phase A: Package Scaffolding

**Goal:** Create the Nx library project with correct configuration. No logic yet — just the skeleton.

- [ ] **A1** — Scaffold the `packages/auth-client/` directory structure using the Nx library generator (`nx g @nx/js:library auth-client --directory=packages/auth-client --importPath=@iexcel/auth-client --publishable`). Verify it appears in the Nx project graph.
  - Complexity: Small
  - References: TR.md §1, TR.md §4

- [ ] **A2** — Configure `package.json` with correct `name`, `type: "module"`, and all subpath `exports` entries (`./types`, `./discovery`, `./validation`, `./refresh`, `./auth-code`, `./device-flow`, `./client-credentials`, `./token-storage`).
  - Complexity: Small
  - References: TR.md §4.2

- [ ] **A3** — Configure `tsconfig.json` with `strict: true`, `module: ESNext`, `moduleResolution: bundler`, and a TypeScript project reference to `packages/shared-types`.
  - Complexity: Small
  - References: TR.md §5

- [ ] **A4** — Configure `project.json` with `build`, `lint`, and `test` targets. Add Nx tags `scope:shared` and `type:library`.
  - Complexity: Small
  - References: TR.md §4.1

- [ ] **A5** — Configure `vite.config.ts` for `vitest` with coverage via `@vitest/coverage-v8`. Set coverage threshold to 90%.
  - Complexity: Small
  - References: TR.md §12

- [ ] **A6** — Install the single runtime dependency: `jose@^5.0.0`. Verify no other runtime dependencies are added.
  - Complexity: Small
  - References: TR.md §2.1

- [ ] **A7** — Verify the Nx build passes on the empty scaffold: `nx build auth-client` and `nx lint auth-client` both succeed.
  - Complexity: Small

---

## Phase B: Type Definitions

**Goal:** Define all shared TypeScript types and error classes. These are consumed by all other modules in this package.

- [ ] **B1** — Create `src/types/errors.ts` with the full error hierarchy: `AuthClientError` (base), `DiscoveryError`, `TokenValidationError` (with `TokenValidationErrorReason` union), `AuthCallbackError`, `DeviceFlowError` (with `DeviceFlowErrorReason` union), `TokenRefreshError`, `ClientCredentialsError`, `TokenStorageError`.
  - Complexity: Small
  - References: FRS.md §9, TR.md §6 (error types)

- [ ] **B2** — Create `src/types/tokens.ts` with `TokenSet`, `StoredTokens`, `TokenClaims` interfaces. Cross-reference feature 01 (shared-types) to avoid duplication — import from `@iexcel/shared-types` if those types already exist there.
  - Complexity: Small
  - References: FRS.md §3.2, FRS.md §8.2, TR.md §6

- [ ] **B3** — Create `src/types/discovery.ts` with `OidcDiscoveryDocument` and `DiscoveryOptions` interfaces.
  - Complexity: Small
  - References: FRS.md §2.2

- [ ] **B4** — Create `src/types/flows.ts` with all flow config interfaces: `TokenValidatorConfig`, `RefreshConfig`, `AuthCodeConfig`, `DeviceFlowConfig`, `DeviceAuthorizationResponse`, `DeviceFlowPollOptions`, `ClientCredentialsConfig`, `ClientCredentialsClient`, `StorageOptions`.
  - Complexity: Small
  - References: FRS.md §3.2 through §8.2

- [ ] **B5** — Create `src/types/index.ts` that re-exports all types from B1–B4. Write unit tests verifying all error classes are instances of `AuthClientError` and have the expected `code` string properties.
  - Complexity: Small
  - References: FRS.md §9, GS.md Feature: Error Handling

---

## Phase C: OIDC Discovery Module

**Goal:** Auto-configure all endpoints from issuer URL. All other modules depend on this.

- [ ] **C1** — Implement `src/discovery/discovery-client.ts` with `getDiscoveryDocument(issuerUrl, options)`. Fetch `{issuerUrl}/.well-known/openid-configuration`, parse JSON, validate required fields are present, cache in-process with TTL.
  - Complexity: Medium
  - References: FRS.md §2, GS.md Feature: OIDC Discovery

- [ ] **C2** — Implement TTL-based cache invalidation in the discovery client. The cache must be per-issuerUrl (map keyed by issuerUrl), support configurable `cacheTtlMs`, and throw `DiscoveryError` (not crash) when the endpoint is unavailable.
  - Complexity: Small
  - References: FRS.md FR-DISC-02, FR-DISC-05

- [ ] **C3** — Write unit tests for the discovery module covering: first-fetch success, cache hit within TTL (no second HTTP call), cache miss after TTL expiry (new HTTP call), HTTP 503 throws `DiscoveryError` with status code, malformed JSON throws `DiscoveryError`.
  - Complexity: Small
  - References: GS.md Feature: OIDC Discovery

- [ ] **C4** — Export the discovery public API from `src/discovery/index.ts`. Verify the subpath import `@iexcel/auth-client/discovery` resolves correctly.
  - Complexity: Small

---

## Phase D: Token Validation Module

**Goal:** JWT validation against JWKS — the most security-critical component.

- [ ] **D1** — Implement `src/validation/jwks-cache.ts`: a JWKS cache class that wraps `jose`'s `createRemoteJWKSet` or manages a custom key cache with TTL-based refresh and forced refresh on `kid` not found. Implement in-flight deduplication for concurrent refresh requests.
  - Complexity: Large
  - References: FRS.md §3, TR.md §7, GS.md — Scenario: Handle key rotation

- [ ] **D2** — Implement `src/validation/token-validator.ts` with `createTokenValidator(config)` returning a `TokenValidator` object. The `validateToken(jwt)` method uses `jose`'s `jwtVerify` with the JWKS cache from D1. Validate `iss`, `aud`, `exp`, `iat`. Map `jose` errors to the typed `TokenValidationError` hierarchy.
  - Complexity: Medium
  - References: FRS.md FR-VAL-01 through FR-VAL-10, TR.md §7

- [ ] **D3** — Write unit tests for `validateToken` covering: valid token success, expired token (`reason: 'expired'`), wrong issuer (`reason: 'invalid_issuer'`), wrong audience (`reason: 'invalid_audience'`), tampered signature (`reason: 'invalid_signature'`), malformed string (`reason: 'malformed'`), kid-not-found triggers JWKS refresh then succeeds, kid-not-found + JWKS unavailable throws `reason: 'jwks_fetch_failed'`, clock skew tolerance (within tolerance passes, outside fails).
  - Complexity: Large
  - References: GS.md Feature: Token Validation

- [ ] **D4** — Export the validation public API from `src/validation/index.ts`.
  - Complexity: Small

---

## Phase E: Token Refresh Module

**Goal:** Refresh access tokens using a stored refresh token.

- [ ] **E1** — Implement `src/refresh/token-refresh.ts` with `refreshAccessToken(config, refreshToken)`. Use the discovery module to get `token_endpoint`. POST with `grant_type=refresh_token`. Handle rotated refresh tokens in the response. Map error responses to `TokenRefreshError`.
  - Complexity: Medium
  - References: FRS.md §4

- [ ] **E2** — Write unit tests covering: successful refresh (with and without token rotation in response), expired refresh token (`invalid_grant`), network failure.
  - Complexity: Small
  - References: GS.md Feature: Token Refresh

- [ ] **E3** — Export from `src/refresh/index.ts`.
  - Complexity: Small

---

## Phase F: Authorization Code Flow Module (PKCE)

**Goal:** Build authorize URLs and handle callbacks for the UI's OIDC flow.

- [ ] **F1** — Implement `src/auth-code/pkce.ts` with `generatePkceChallenge()`. Use `webcrypto` (Node.js built-in) to generate 32 random bytes, base64url-encode as `codeVerifier`, SHA-256 hash and base64url-encode as `codeChallenge`. Verify `jose` v5 doesn't already provide this utility before implementing manually.
  - Complexity: Small
  - References: FRS.md FR-AUTH-03, FR-AUTH-04, TR.md §10

- [ ] **F2** — Implement `src/auth-code/authorize-url.ts` with `buildAuthorizeUrl(config, state, codeVerifier)`. Use discovery to get `authorization_endpoint`. Construct URL with `response_type=code`, all required query parameters, and `code_challenge_method=S256`.
  - Complexity: Small
  - References: FRS.md FR-AUTH-01, FR-AUTH-02

- [ ] **F3** — Implement `src/auth-code/callback-handler.ts` with `exchangeCodeForTokens(config, callbackUrl, state, codeVerifier)`. Parse the callback URL. Validate `state` matches. Handle `error` parameter from provider. POST to `token_endpoint` with `grant_type=authorization_code`. Return `TokenSet`.
  - Complexity: Medium
  - References: FRS.md FR-AUTH-05 through FR-AUTH-07

- [ ] **F4** — Write unit tests covering: PKCE challenge pair correctness (SHA-256 hash verification), authorize URL structure and all required parameters, successful code exchange, state mismatch throws `AuthCallbackError(reason: 'state_mismatch')`, provider error in callback throws `AuthCallbackError(reason: 'provider_error')`, missing code in callback.
  - Complexity: Medium
  - References: GS.md Feature: Authorization Code Flow (PKCE)

- [ ] **F5** — Export from `src/auth-code/index.ts`.
  - Complexity: Small

---

## Phase G: Device Flow Module

**Goal:** RFC 8628-compliant device authorization flow for terminal tools.

- [ ] **G1** — Implement `src/device-flow/initiate.ts` with `initiateDeviceFlow(config)`. Use discovery to get `device_authorization_endpoint`. POST with `client_id` and `scope`. Parse and return `DeviceAuthorizationResponse`.
  - Complexity: Small
  - References: FRS.md FR-DEV-01, FR-DEV-02

- [ ] **G2** — Implement `src/device-flow/poller.ts` with `pollDeviceToken(config, deviceCode, interval, expiresIn, options?)`. Implement the RFC 8628 §3.5 polling loop: initial wait, `authorization_pending` continue, `slow_down` adds 5s to interval, `expired_token` throws, `access_denied` throws, elapsed-past-expiry throws timeout, success returns `TokenSet`. Fire `onPrompt` callback on each poll status.
  - Complexity: Large
  - References: FRS.md FR-DEV-03 through FR-DEV-11, TR.md §8, GS.md Feature: Device Authorization Flow

- [ ] **G3** — Write unit tests covering: successful poll on third attempt, slow_down increases interval, two consecutive slow_downs accumulate, expired_token throws `DeviceFlowError(reason: 'expired')`, access_denied throws `DeviceFlowError(reason: 'access_denied')`, timeout when expiresIn elapsed, onPrompt callback receives messages.
  - Complexity: Large
  - References: GS.md Feature: Device Authorization Flow

- [ ] **G4** — Export from `src/device-flow/index.ts`.
  - Complexity: Small

---

## Phase H: Client Credentials Module

**Goal:** Service-to-service token management for Mastra.

- [ ] **H1** — Implement `src/client-credentials/client.ts` with `createClientCredentialsClient(config)`. Return an object with `getAccessToken()` and `forceRefresh()`. Implement in-memory token caching with expiry-buffer check. Implement in-flight deduplication so concurrent `getAccessToken()` calls result in only one token endpoint request.
  - Complexity: Large
  - References: FRS.md §7, TR.md §7 (deduplication pattern), GS.md Feature: Client Credentials Flow

- [ ] **H2** — Write unit tests covering: initial fetch on first call, cache hit returns cached token, auto-refresh within expiry buffer, concurrent calls deduplicate to single request, forceRefresh bypasses cache, invalid_client throws `ClientCredentialsError`.
  - Complexity: Medium
  - References: GS.md Feature: Client Credentials Flow

- [ ] **H3** — Export from `src/client-credentials/index.ts`.
  - Complexity: Small

---

## Phase I: Token Storage Module

**Goal:** Secure file-based token persistence for terminal tools.

- [ ] **I1** — Implement `src/token-storage/file-store.ts` with `saveTokens`, `loadTokens`, `clearTokens`. Default path: `~/.iexcel/auth/tokens.json`. Create parent directory with `mode: 0o700` if missing. Write file with `mode: 0o600`. Return `null` (not throw) for missing or malformed files on load.
  - Complexity: Medium
  - References: FRS.md §8, TR.md §9, GS.md Feature: Token Storage

- [ ] **I2** — Write unit tests using a configurable `filePath` (temp directory) to avoid polluting `~/.iexcel/`. Cover: save/load round-trip, creates directory if missing, file permissions are 0600, missing file returns null, malformed JSON returns null, clearTokens deletes file, subsequent load after clear returns null.
  - Complexity: Medium
  - References: GS.md Feature: Token Storage (Terminal / File-based)

- [ ] **I3** — Export from `src/token-storage/index.ts`.
  - Complexity: Small

---

## Phase J: Integration and Final Wiring

**Goal:** Wire up root exports, verify the full package builds and tests pass.

- [ ] **J1** — Create `src/index.ts` root barrel that re-exports all public API from all submodules. Ensure tree-shaking still works (no forced eager imports).
  - Complexity: Small

- [ ] **J2** — Run `nx test auth-client --coverage` and confirm: all tests pass, coverage is at or above 90% on lines and branches.
  - Complexity: Small

- [ ] **J3** — Run `nx build auth-client` and confirm: TypeScript compiles without errors, no `any` leakage, `dist/packages/auth-client/` is populated correctly.
  - Complexity: Small

- [ ] **J4** — Run `nx lint auth-client` and confirm: zero lint errors.
  - Complexity: Small

- [ ] **J5** — Run `nx graph` and verify: `api`, `ui`, `mastra` all appear as dependents of `auth-client` in the Nx project graph.
  - Complexity: Small

- [ ] **J6** — Write a brief integration smoke test (not requiring a live auth service): instantiate `createTokenValidator` with a test JWKS (RSA key pair generated in the test), sign a test JWT with the test private key, verify the signed JWT passes validation and returns the expected `TokenClaims`. This confirms the full validation pipeline is wired end-to-end.
  - Complexity: Medium

---

## Phase K: Documentation and Handoff

- [ ] **K1** — Add TSDoc comments to all exported functions and interfaces. At minimum document: parameters, return type, what errors are thrown and when.
  - Complexity: Medium

- [ ] **K2** — Create `packages/auth-client/README.md` with: purpose, consumer guide (which subpath each app should import), configuration reference (environment variables, config options), error handling guide.
  - Complexity: Small

- [ ] **K3** — Update the Memory Bank (`memory-bank/systemPatterns.md`) with: `auth-client` package existence, its subpath export pattern, the `fetchImpl` injection pattern for testability, and the JWKS cache architecture. This ensures downstream feature developers (07, 24, 32, 18) know what to import and how to configure it.
  - Complexity: Small

---

## Summary

| Phase | Tasks | Complexity |
|---|---|---|
| A: Scaffolding | A1–A7 | 7 small tasks |
| B: Types | B1–B5 | 4 small + 1 small |
| C: Discovery | C1–C4 | 2 medium + 2 small |
| D: Validation | D1–D4 | 1 large + 1 medium + 1 large + 1 small |
| E: Refresh | E1–E3 | 1 medium + 1 small + 1 small |
| F: Auth Code | F1–F5 | 2 small + 1 medium + 1 medium + 1 small |
| G: Device Flow | G1–G4 | 1 small + 1 large + 1 large + 1 small |
| H: Client Credentials | H1–H3 | 1 large + 1 medium + 1 small |
| I: Token Storage | I1–I3 | 1 medium + 1 medium + 1 small |
| J: Integration | J1–J6 | 5 small + 1 medium |
| K: Documentation | K1–K3 | 2 small + 1 medium |

**Total:** 37 tasks
**Estimated sessions:** 8–12 development sessions (large tasks may each take a session; small tasks can be batched)
